import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wishlistApi } from '../api/endpoints';

/**
 * Saved products.
 *
 * Same shape of problem as the cart, so the same answer: the server owns it
 * when signed in, AsyncStorage holds a guest list until then, and `adopt()`
 * merges the guest list up at login.
 *
 * State is a Set of product ids rather than a list of rows, because the only
 * question a heart on a card ever asks is "is this one saved?". The full rows
 * are kept alongside for a wishlist screen to render.
 */
const STORAGE_KEY = 'wishlist_ids_v1';

async function persist(ids) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Losing a guest wishlist on restart is survivable; breaking the heart
    // button is not.
  }
}

export const useWishlistStore = create((set, get) => ({
  /** Set<productId> — what the hearts read. */
  ids: new Set(),
  /** Populated rows, server-side only. A wishlist screen renders these. */
  items: [],
  remote: false,
  /** Ids with a request in flight, so a heart can show it's working. */
  pending: new Set(),

  has: (productId) => get().ids.has(String(productId)),

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const ids = raw ? JSON.parse(raw) : [];
      set({ ids: new Set(Array.isArray(ids) ? ids.map(String) : []) });
    } catch {
      set({ ids: new Set() });
    }
  },

  /** Switch to the server wishlist, merging anything saved as a guest. */
  adopt: async () => {
    const local = [...get().ids];
    try {
      const data = local.length
        ? await wishlistApi.merge(local)
        : await wishlistApi.get();
      await persist([]);
      set({
        ids: new Set((data.productIds || []).map(String)),
        items: data.wishlist || [],
        remote: true,
      });
      return { ok: true };
    } catch (err) {
      // Offline: keep the local list visible and keep working locally.
      return { ok: false, error: err.message };
    }
  },

  /** Back to a device-only list. Call on logout. */
  release: async () => {
    await persist([]);
    set({ ids: new Set(), items: [], remote: false });
  },

  refresh: async () => {
    if (!get().remote) return;
    try {
      const data = await wishlistApi.get();
      set({ ids: new Set((data.productIds || []).map(String)), items: data.wishlist || [] });
    } catch {
      // Leave the last known list on screen.
    }
  },

  /**
   * Toggle one product.
   *
   * Optimistic: a heart has to fill the instant it's tapped. On failure the
   * flip is reverted, so the icon never claims something the server didn't do.
   */
  toggle: async (productId) => {
    const id = String(productId);
    const { ids, remote } = get();
    const saving = !ids.has(id);

    const next = new Set(ids);
    saving ? next.add(id) : next.delete(id);
    set({ ids: next, pending: new Set([...get().pending, id]) });

    const settle = () =>
      set((s) => {
        const pending = new Set(s.pending);
        pending.delete(id);
        return { pending };
      });

    if (!remote) {
      persist(next);
      settle();
      return { ok: true, saved: saving };
    }

    try {
      const data = saving ? await wishlistApi.add(id) : await wishlistApi.remove(id);
      set({
        ids: new Set((data.productIds || []).map(String)),
        items: data.wishlist || [],
      });
      settle();
      return { ok: true, saved: saving };
    } catch (err) {
      // Put the heart back how it was.
      set({ ids });
      settle();
      return { ok: false, error: err.message };
    }
  },

  count: () => get().ids.size,
}));
