import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { resolveBaseUrl } from './resolveBaseUrl';

/**
 * The one axios instance. Every request goes through here so auth, timeouts
 * and error shaping are decided once.
 *
 * ── Which backend a build talks to ─────────────────────────────────────────
 *
 * Release builds (APK / AAB) use `extra.apiBaseUrl` from app.json — the
 * deployed API. There is no fallback in a release build: a shipped app that
 * quietly pointed at a laptop would look like it worked in testing and fail
 * for every real user, so a missing value throws at startup instead.
 *
 * Development derives the URL from `hostUri` — the address the app used to
 * reach Metro, which is by definition a route back to the dev machine from
 * wherever the app is running. Only the port changes (Metro 8081 → API 4000).
 * This matters because `localhost` means something different on every target:
 *   • iOS simulator   — shares the Mac's network, so localhost works
 *   • Android emulator— localhost is the EMULATOR; the host Mac is 10.0.2.2
 *   • physical device — localhost is the phone; needs the Mac's LAN IP
 *
 * To point a dev build at the deployed API (or at staging), set
 * EXPO_PUBLIC_API_BASE_URL — it wins everywhere, in both modes.
 */
const TOKEN_KEY = 'auth_token';

export const API_BASE_URL = resolveBaseUrl({
  dev: __DEV__,
  configured: Constants.expoConfig?.extra?.apiBaseUrl,
  override: process.env.EXPO_PUBLIC_API_BASE_URL,
  hostUri:
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    '',
  platform: Platform.OS,
});

if (__DEV__) {
  // Printed once on boot so a connection problem is one glance at the logs,
  // not a guess.
  console.log(`[api] base URL: ${API_BASE_URL}`);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

/* ------------------------------------------------------------------ */
/* Token storage — the JWT lives in the keychain, not AsyncStorage      */
/* ------------------------------------------------------------------ */

export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/* ------------------------------------------------------------------ */
/* Interceptors                                                         */
/* ------------------------------------------------------------------ */

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Collapses every failure into one `Error` with a message worth showing a
 * user, so screens only ever handle `err.message`. `err.status` is preserved
 * for the rare caller that needs to branch on it.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    let message;
    const status = error.response?.status;

    if (error.code === 'ECONNABORTED') {
      message = 'The request timed out. Check your connection and try again.';
    } else if (!error.response) {
      // No response at all — wrong host, server down, or blocked cleartext.
      // In dev, name the URL that failed: that single detail is the
      // difference between a two-minute fix and an afternoon.
      message = __DEV__
        ? `Can't reach the server at ${API_BASE_URL}. Is the backend running, and is this address reachable from your device?`
        : "Can't reach the server. Check your connection and try again.";
    } else if (status === 401) {
      message = 'Your session has expired. Please sign in again.';
    } else if (status === 403) {
      message = error.response.data?.message || "You don't have access to that.";
    } else if (status === 404) {
      message = error.response.data?.message || 'Not found.';
    } else if (status >= 500) {
      message = 'Something went wrong on our side. Please try again.';
    } else {
      message = error.response.data?.message || 'Something went wrong.';
    }

    const shaped = new Error(message);
    shaped.status = status;
    shaped.original = error;
    return Promise.reject(shaped);
  }
);

export default api;
