/**
 * Which backend a build talks to.
 *
 * Pulled out of client.js as a pure function because it is the one piece of
 * configuration that can brick a shipped build: an APK pointing at a laptop
 * looks fine in testing and fails for every real user. Pure means it can be
 * checked for both modes without launching an app.
 *
 * Precedence:
 *   1. EXPO_PUBLIC_API_BASE_URL — wins everywhere (staging, or pointing a dev
 *      build at the deployed API).
 *   2. Release build → expo.extra.apiBaseUrl, or throw. No silent fallback.
 *   3. Dev build → derived from the Metro host, which is by definition a
 *      route back to the dev machine from wherever the app is running.
 */

export const API_PORT = 4000;
export const API_PATH = '/api/v1';

/** Strip trailing slashes so every path join produces one separator. */
const clean = (url) => String(url).replace(/\/+$/, '');

const LOOPBACK = new Set(['localhost', '127.0.0.1', '']);

export function resolveBaseUrl({ dev, configured, override, hostUri = '', platform } = {}) {
  if (override) return clean(override);

  if (!dev) {
    if (!configured) {
      throw new Error(
        'No API URL configured for this build. Set expo.extra.apiBaseUrl in app.json.'
      );
    }
    return clean(configured);
  }

  // ── Development ──
  //
  // `localhost` means something different on every target: on the iOS
  // simulator it's the Mac, on the Android emulator it's the emulator itself
  // (the Mac is 10.0.2.2), and on a physical device it's the phone. The Metro
  // host is the one address known to reach the dev machine.
  //
  // A configured production URL is deliberately NOT used here — otherwise
  // every local change would be tested against the live database.
  const host = String(hostUri).split('/')[0].split(':')[0];
  if (!LOOPBACK.has(host)) {
    return `http://${host}:${API_PORT}${API_PATH}`;
  }

  const fallbackHost = platform === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${fallbackHost}:${API_PORT}${API_PATH}`;
}
