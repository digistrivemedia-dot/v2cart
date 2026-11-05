import { create } from 'zustand';
import { settingsApi } from '../api/endpoints';

/**
 * Platform-wide rates the app has to know to show correct money.
 *
 * Only GST today. It matters more than it looks: the backend stores the
 * `totalPrice` this app sends and charges that amount, so a wrong rate here
 * is a wrong charge — not just a wrong label.
 *
 * Starts unloaded rather than assuming a rate, and checkout refuses to place
 * an order until it is known (see app/checkout.js). The cart screen may show
 * the fallback briefly while the first fetch lands; it only ever displays.
 */

/**
 * The rate before settings arrive: what the platform charged when GST was
 * hardcoded. Used for display only, never to place an order.
 */
export const FALLBACK_GST_PCT = 18;

export const useSettingsStore = create((set, get) => ({
  gstPct: null,
  loaded: false,
  loading: false,

  /** The rate to compute with — the real one once known, else the fallback. */
  gstRate: () => (get().gstPct ?? FALLBACK_GST_PCT) / 100,

  load: async () => {
    if (get().loading) return { ok: get().loaded };
    set({ loading: true });
    try {
      const { gstPct } = await settingsApi.tax();
      set({ gstPct: Number(gstPct) || 0, loaded: true, loading: false });
      return { ok: true };
    } catch (err) {
      set({ loading: false });
      return { ok: false, error: err.message };
    }
  },
}));
