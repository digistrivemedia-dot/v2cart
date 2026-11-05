import { create } from 'zustand';
import { authApi } from '../api/endpoints';
import { saveToken, clearToken, getToken } from '../api/client';
import { useCartStore } from './cartStore';
import { useWishlistStore } from './wishlistStore';

/**
 * Session state. The JWT itself lives in the keychain (api/client.js) and is
 * attached by an interceptor — this store only holds the user and the flags
 * screens render from.
 *
 * `bootstrapping` starts true so the app can tell "not signed in" apart from
 * "haven't checked yet". Without it the UI flashes a logged-out state on
 * every cold start.
 */
export const useAuthStore = create((set) => ({
  user: null,
  bootstrapping: true,
  submitting: false,
  error: null,

  /** Called once on app start: restores a session if a token survives. */
  bootstrap: async () => {
    try {
      const token = await getToken();
      if (!token) {
        set({ user: null, bootstrapping: false });
        return;
      }
      const { user } = await authApi.me();
      set({ user, bootstrapping: false });
      // The session survived, so the cart is the server's, not the device's.
      await useCartStore.getState().adopt();
      await useWishlistStore.getState().adopt();
    } catch {
      // An expired or rejected token is just "signed out" — clear it so the
      // interceptor stops sending a dead credential on every request.
      await clearToken();
      set({ user: null, bootstrapping: false });
    }
  },

  login: async (email, password) => {
    set({ submitting: true, error: null });
    try {
      const { user, token } = await authApi.login(email, password);
      await saveToken(token);
      set({ user, submitting: false });
      // Whatever they put in the basket as a guest comes with them.
      await useCartStore.getState().adopt();
      await useWishlistStore.getState().adopt();
      return { ok: true };
    } catch (err) {
      set({ submitting: false, error: err.message });
      return { ok: false, error: err.message };
    }
  },

  register: async ({ name, email, password }) => {
    set({ submitting: true, error: null });
    try {
      // No `role` — the backend defaults to 'user', i.e. a customer. Vendor
      // and investor signups stay on the web, where their extra profile
      // fields and approval flow live.
      const { user, token } = await authApi.register({ name, email, password });
      await saveToken(token);
      set({ user, submitting: false });
      await useCartStore.getState().adopt();
      await useWishlistStore.getState().adopt();
      return { ok: true };
    } catch (err) {
      set({ submitting: false, error: err.message });
      return { ok: false, error: err.message };
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Signing out must work offline too — the local token is what matters.
    }
    await clearToken();
    // The cart belongs to the account, so it doesn't linger on the device for
    // whoever signs in next.
    await useCartStore.getState().release();
    await useWishlistStore.getState().release();
    set({ user: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
