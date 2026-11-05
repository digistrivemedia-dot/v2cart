import { useSyncExternalStore } from 'react';

/**
 * Auth Client for Backend Integration
 * Handles authentication with the backend API
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

export const TOKEN_KEY = 'auth_token';
export const USER_KEY = 'user';

interface AuthResponse {
  success: boolean;
  user?: any;
  token?: string;
  message?: string;
}

interface SignInParams {
  email: string;
  password: string;
  callbackURL?: string;
}

interface PayoutDetails {
  accountName?: string;
  accountNumber?: string;
  ifsc?: string;
  upiId?: string;
}

interface SignUpParams {
  name: string;
  email: string;
  password: string;
  gender?: string;
  callbackURL?: string;
  role?: 'vendor' | 'investor';
  vendorProfile?: { businessName?: string; gstNumber?: string; payoutDetails?: PayoutDetails };
  investorProfile?: { payoutDetails?: PayoutDetails };
}

/**
 * Writes the session to localStorage + cookies and pushes it into the shared
 * store, so the navbar and every other useSession caller update immediately
 * instead of waiting for a remount.
 */
function persistSession(user: any, token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  // Cookies exist so middleware.ts can see a token at the edge.
  const maxAge = 60 * 60 * 24 * 7;
  document.cookie = `token=${token}; path=/; max-age=${maxAge}; SameSite=Lax`;
  document.cookie = `user=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=${maxAge}; SameSite=Lax`;

  setSession(user, token);
}

export const authClient = {
  signIn: {
    email: async (params: SignInParams) => {
      try {
        const response = await fetch(`${API_BASE_URL}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Important: Include cookies
          body: JSON.stringify({
            email: params.email,
            password: params.password,
          }),
        });

        const data: AuthResponse = await response.json();

        if (!response.ok || !data.success) {
          return {
            data: null,
            error: { message: data.message || 'Invalid email or password' },
          };
        }

        // Store token in localStorage and set cookie
        if (data.token) {
          persistSession(data.user, data.token);
        }

        return { data: data.user, error: null };
      } catch (error) {
        console.error('Sign in error:', error);
        return {
          data: null,
          error: { message: 'Network error. Please try again.' },
        };
      }
    },

    social: async (params?: any) => {
      // Social auth not implemented yet
      return {
        data: null,
        error: { message: 'Social authentication not implemented' },
      };
    },
  },

  signUp: {
    email: async (params: SignUpParams) => {
      try {
        const response = await fetch(`${API_BASE_URL}/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            name: params.name,
            email: params.email,
            password: params.password,
            gender: params.gender || 'other',
            role: params.role,
            vendorProfile: params.vendorProfile,
            investorProfile: params.investorProfile,
          }),
        });

        const data: AuthResponse = await response.json();

        if (!response.ok || !data.success) {
          return {
            data: null,
            error: { message: data.message || 'Error creating account' },
          };
        }

        // Store token in localStorage and cookies
        if (data.token) {
          persistSession(data.user, data.token);
        }

        return { data: data.user, error: null };
      } catch (error) {
        console.error('Sign up error:', error);
        return {
          data: null,
          error: { message: 'Network error. Please try again.' },
        };
      }
    },
  },

  signOut: async () => {
    // Local state is cleared in `finally`, unconditionally: a failed or
    // unreachable backend must never leave the user stuck logged in.
    try {
      await fetch(`${API_BASE_URL}/logout`, { method: 'GET', credentials: 'include' });
    } catch (error) {
      console.error('Sign out error (clearing local session anyway):', error);
    } finally {
      clearSession();
    }

    return { data: { success: true }, error: null };
  },

};

/* ------------------------------------------------------------------ *
 * Session store
 *
 * This used to be a plain useState + useEffect([]) inside useSession,
 * which caused three separate bugs:
 *
 *  1. Each of the ~16 useSession callers kept its OWN copy of the session,
 *     read once on mount and never again. Clearing localStorage on logout
 *     left every mounted component (the navbar above all) still rendering
 *     the logged-out user's name and email.
 *  2. The stored blob was trusted without ever being checked against the
 *     backend. localStorage is keyed by ORIGIN, not by project — so a
 *     different app previously served on this same localhost port leaves
 *     behind `auth_token`/`user` that this app happily read as its own
 *     session. That is how a stranger's account can appear in the navbar,
 *     and why /me then answers "jwt malformed": the token was signed by a
 *     different backend with a different secret.
 *  3. Nothing noticed an expired token, so RoleGuard would open the admin
 *     UI off a role string that the server would have rejected.
 *
 * Now there is one shared store, it is verified against /me, and anything
 * the server rejects is purged. Read optimistically first so there's no
 * logged-out flash on reload, then reconcile.
 * ------------------------------------------------------------------ */

type SessionUser = Record<string, any> | null;
type Session = {
  data: { session: { token: string } | null; user: SessionUser };
  isPending: boolean;
  error: any | null;
};

const EMPTY: Session = { data: { session: null, user: null }, isPending: false, error: null };
const PENDING: Session = { data: { session: null, user: null }, isPending: true, error: null };

let snapshot: Session = PENDING;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setSnapshot(next: Session) {
  snapshot = next;
  emit();
}

function readStored(): Session {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    if (!token || !userStr) return EMPTY;
    return { data: { session: { token }, user: JSON.parse(userStr) }, isPending: false, error: null };
  } catch {
    return EMPTY;
  }
}

function clearStored() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = 'token=; path=/; max-age=0';
  document.cookie = 'user=; path=/; max-age=0';
}

/** Called by signIn/signUp so every mounted consumer updates immediately. */
export function setSession(user: SessionUser, token: string) {
  setSnapshot({ data: { session: { token }, user }, isPending: false, error: null });
}

/** Called by signOut. Purges storage AND the in-memory store. */
export function clearSession() {
  clearStored();
  setSnapshot(EMPTY);
}

async function verify() {
  const optimistic = readStored();
  // Show the stored session right away, but keep isPending until /me answers
  // so RoleGuard doesn't act on an unverified role.
  snapshot = optimistic.data.user ? { ...optimistic, isPending: true } : EMPTY;
  emit();

  const token = optimistic.data.session?.token;
  if (!token) return setSnapshot(EMPTY);

  try {
    const response = await fetch(`${API_BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      // The server actively rejected this token (expired, malformed, or
      // issued by another app's backend). It is not ours — purge it.
      clearSession();
      return;
    }

    // Trust the server's copy over the stored blob: role/name/email stay
    // fresh, and a role changed by an admin takes effect on next load.
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setSnapshot({ data: { session: { token }, user: data.user }, isPending: false, error: null });
  } catch (error) {
    // Network error, not a rejection — the backend being down must not log
    // anyone out. Keep the optimistic session and let API calls fail loudly.
    console.error('Session verification failed (backend unreachable?):', error);
    setSnapshot({ ...optimistic, isPending: false, error });
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  if (!started) {
    started = true;
    verify();
    // Keep tabs in sync: logging out in one tab logs out the others.
    window.addEventListener('storage', (e) => {
      if (e.key === TOKEN_KEY || e.key === USER_KEY) setSnapshot(readStored());
    });
  }

  return () => {
    listeners.delete(onChange);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => PENDING;

/** Current session, shared across all callers and verified against the API. */
export function useSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Force a re-check, e.g. after the profile page updates name/email. */
export function refreshSession() {
  return verify();
}

// signOut function
export async function signOut() {
  return await authClient.signOut();
}

// signIn function
export async function signIn(provider: string) {
  console.log("Sign in with:", provider);
  return { data: null, error: { message: 'Not implemented' } };
}
