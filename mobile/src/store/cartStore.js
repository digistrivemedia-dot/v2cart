import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cartTotals, unitPrice } from '../utils/pricing';
import { cartApi } from '../api/endpoints';
import { useSettingsStore } from './settingsStore';

/**
 * The cart.
 *
 * Signed in, the server is the only source of truth: every mutation hits
 * `/cart` on the backend (which stores it on the user document), so a basket
 * filled here shows up on the website and vice versa. Each call returns the
 * whole cart, so the store just takes what came back rather than guessing
 * what the server did.
 *
 * Signed out, the same operations run against AsyncStorage so someone can
 * shop before making an account. `adopt()` pushes that local basket up on
 * login and switches the store over to the server copy.
 *
 * A "line" is identified by product + variant, so the same tile in two
 * colours is two lines rather than one with a muddled quantity. `lineKey`
 * mirrors the backend's own line matching.
 */
const STORAGE_KEY = 'cart_items_v1';

/**
 * A line's identity. Exported because anything that wants to show "how many
 * of this are in the cart" has to look the line up by the same key — a second
 * copy of this format is how the lookup silently stops matching.
 */
export const cartLineKey = (productId, variant) =>
  `${productId}::${variant?.color ?? ''}::${variant?.size ?? ''}`;

const lineKey = cartLineKey;

async function persist(items) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // A failed write shouldn't break the cart in memory — worst case the
    // basket doesn't survive a restart.
  }
}

/**
 * Server lines → the shape screens already render. Keeping the local shape
 * means no screen cares whether the cart came from the server or the device.
 */
function fromServer(cart) {
  return (cart ?? []).map((line) => ({
    key: lineKey(line.productId, line.variant),
    // The server's subdocument id — what update/remove address.
    serverId: line.id,
    quantity: line.quantity,
    variant:
      line.variant?.color || line.variant?.size
        ? { color: line.variant.color, size: line.variant.size }
        : null,
    product: {
      _id: line.productId,
      name: line.name,
      price: line.price,
      cuttedPrice: line.cuttedPrice,
      stock: line.stock,
      images: line.images?.slice(0, 1) ?? (line.image ? [{ url: line.image }] : []),
    },
  }));
}

/** The payload /cart/merge expects — only what the server needs to rebuild. */
const toMergePayload = (items) =>
  items.map((i) => ({
    product: i.product._id,
    quantity: i.quantity,
    variant: i.variant || undefined,
  }));

export const useCartStore = create((set, get) => ({
  items: [],
  hydrated: false,
  /** True once a session is known — mutations then go to the server. */
  remote: false,
  syncing: false,

  /**
   * Called on app start. Loads the local basket so the cart renders instantly;
   * `adopt()` takes over if it turns out there's a session.
   */
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const items = raw ? JSON.parse(raw) : [];
      set({ items: Array.isArray(items) ? items : [], hydrated: true });
    } catch {
      set({ items: [], hydrated: true });
    }
  },

  /**
   * Switch to the server cart. Call after login/register/bootstrap.
   *
   * Anything sitting in the local basket is merged up first — a guest who
   * filled a cart then signed in keeps it — and the device copy is cleared so
   * it can't later be merged a second time.
   */
  adopt: async () => {
    const local = get().items.filter((i) => !i.serverId);
    set({ syncing: true });
    try {
      const { cart } = local.length
        ? await cartApi.merge(toMergePayload(local))
        : await cartApi.get();
      await persist([]);
      set({ items: fromServer(cart), remote: true, syncing: false, hydrated: true });
      return { ok: true };
    } catch (err) {
      // Offline or a dead token: keep showing the local basket rather than an
      // empty cart, and stay in local mode so adding still works.
      set({ syncing: false });
      return { ok: false, error: err.message };
    }
  },

  /** Back to a device-only cart. Call on logout. */
  release: async () => {
    await persist([]);
    set({ items: [], remote: false });
  },

  /** Re-read the server cart — pull-to-refresh, or returning to the screen. */
  refresh: async () => {
    if (!get().remote) return;
    set({ syncing: true });
    try {
      const { cart } = await cartApi.get();
      set({ items: fromServer(cart), syncing: false });
    } catch {
      // Leave the last known cart on screen.
      set({ syncing: false });
    }
  },

  add: async (product, quantity = 1, variant = null) => {
    // Never let the cart exceed what's in stock — the backend decrements it
    // at order time and would otherwise fail after payment. The server
    // enforces this too; checking here keeps the error instant.
    const max = Number(product.stock) > 0 ? Number(product.stock) : 0;
    if (max === 0) return { ok: false, error: 'This product is out of stock.' };

    if (get().remote) {
      set({ syncing: true });
      try {
        const { cart } = await cartApi.add(product._id, quantity, variant);
        set({ items: fromServer(cart), syncing: false });
        return { ok: true };
      } catch (err) {
        set({ syncing: false });
        return { ok: false, error: err.message };
      }
    }

    const key = lineKey(product._id, variant);
    const items = [...get().items];
    const existing = items.findIndex((i) => i.key === key);

    if (existing >= 0) {
      const next = Math.min(items[existing].quantity + quantity, max);
      items[existing] = { ...items[existing], quantity: next };
    } else {
      items.push({
        key,
        quantity: Math.min(quantity, max),
        variant,
        // A snapshot, so the cart renders instantly offline. Price is
        // re-read from the server at checkout — this copy is for display.
        product: {
          _id: product._id,
          name: product.name,
          price: product.price,
          cuttedPrice: product.cuttedPrice,
          stock: product.stock,
          images: product.images?.slice(0, 1) ?? [],
        },
      });
    }

    set({ items });
    persist(items);
    return { ok: true };
  },

  setQuantity: async (key, quantity) => {
    const line = get().items.find((i) => i.key === key);
    if (!line) return;

    if (get().remote && line.serverId) {
      // Optimistic: the stepper has to feel immediate. The server's answer
      // replaces this, and a failure re-reads the truth.
      const max = Number(line.product.stock) > 0 ? Number(line.product.stock) : 1;
      const clamped = Math.max(1, Math.min(quantity, max));
      set({
        items: get().items.map((i) => (i.key === key ? { ...i, quantity: clamped } : i)),
      });
      try {
        const { cart } = await cartApi.setQuantity(line.serverId, clamped);
        set({ items: fromServer(cart) });
      } catch {
        get().refresh();
      }
      return;
    }

    const items = get().items.map((i) => {
      if (i.key !== key) return i;
      const max = Number(i.product.stock) > 0 ? Number(i.product.stock) : 1;
      return { ...i, quantity: Math.max(1, Math.min(quantity, max)) };
    });
    set({ items });
    persist(items);
  },

  remove: async (key) => {
    const line = get().items.find((i) => i.key === key);

    if (get().remote && line?.serverId) {
      set({ items: get().items.filter((i) => i.key !== key) });
      try {
        const { cart } = await cartApi.remove(line.serverId);
        set({ items: fromServer(cart) });
      } catch {
        get().refresh();
      }
      return;
    }

    const items = get().items.filter((i) => i.key !== key);
    set({ items });
    persist(items);
  },

  clear: async () => {
    if (get().remote) {
      set({ items: [] });
      try {
        await cartApi.clear();
      } catch {
        get().refresh();
      }
      return;
    }
    set({ items: [] });
    persist([]);
  },

  /**
   * Derived; components read this rather than recomputing totals.
   *
   * The GST rate comes from platform settings, so every screen showing a
   * total uses the rate admin actually set.
   */
  totals: (discount = 0) =>
    cartTotals(get().items, discount, useSettingsStore.getState().gstRate()),

  count: () => get().items.reduce((n, i) => n + i.quantity, 0),

  /** How many of this product+variant are in the cart right now. */
  quantityOf: (productId, variant = null) =>
    get().items.find((i) => i.key === cartLineKey(productId, variant))?.quantity ?? 0,

  /** The orderItems payload POST /order/new expects. */
  toOrderItems: () =>
    get().items.map((i) => ({
      product: i.product._id,
      name: i.product.name,
      price: unitPrice(i.product, i.variant),
      quantity: i.quantity,
      image: i.product.images?.[0]?.url ?? '',
      size: i.variant?.size ?? undefined,
    })),
}));
