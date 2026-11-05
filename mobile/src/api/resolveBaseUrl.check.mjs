/**
 * Self-check for API URL resolution.
 *
 * This is the one setting that can brick a release build, so both modes are
 * pinned here. Run with: node src/api/resolveBaseUrl.check.mjs
 */
import assert from 'node:assert';
import { resolveBaseUrl } from './resolveBaseUrl.js';

const PROD = 'https://mvc-ecom-be.vercel.app/api/v1';

// --- A release build uses the deployed API ------------------------------
assert.strictEqual(
  resolveBaseUrl({ dev: false, configured: PROD }),
  PROD,
  'a release build must use the configured API'
);

// A release build must never fall back to a dev machine, even when a Metro
// host happens to be baked in — that is the bug this guards.
assert.strictEqual(
  resolveBaseUrl({ dev: false, configured: PROD, hostUri: '192.168.1.8:8081' }),
  PROD,
  'a release build must ignore any Metro host'
);

// --- A release build with nothing configured fails loudly ---------------
assert.throws(
  () => resolveBaseUrl({ dev: false, configured: undefined }),
  /No API URL configured/,
  'shipping with no API URL must throw, not silently point at localhost'
);
assert.throws(() => resolveBaseUrl({ dev: false, configured: '' }), /No API URL configured/);

// --- Trailing slashes never produce a double separator ------------------
for (const url of [PROD + '/', PROD + '///']) {
  assert.strictEqual(resolveBaseUrl({ dev: false, configured: url }), PROD, `cleaned: ${url}`);
}

// --- Dev derives the dev machine from the Metro host --------------------
assert.strictEqual(
  resolveBaseUrl({ dev: true, hostUri: '192.168.1.8:8081' }),
  'http://192.168.1.8:4000/api/v1',
  'a LAN device must reach the Mac, on the API port'
);
assert.strictEqual(
  resolveBaseUrl({ dev: true, hostUri: '192.168.1.8:8081/_expo/loading' }),
  'http://192.168.1.8:4000/api/v1',
  'a hostUri with a path still yields the host'
);

// --- Dev must NOT use the production URL -------------------------------
// Otherwise every local change is tested against the live database.
assert.strictEqual(
  resolveBaseUrl({ dev: true, configured: PROD, hostUri: '192.168.1.8:8081' }),
  'http://192.168.1.8:4000/api/v1',
  'development must stay on the dev machine even when production is configured'
);

// --- Dev loopback fallbacks are per-platform ---------------------------
assert.strictEqual(
  resolveBaseUrl({ dev: true, hostUri: 'localhost:8081', platform: 'android' }),
  'http://10.0.2.2:4000/api/v1',
  'the Android emulator reaches the host machine at 10.0.2.2'
);
assert.strictEqual(
  resolveBaseUrl({ dev: true, hostUri: 'localhost:8081', platform: 'ios' }),
  'http://localhost:4000/api/v1',
  'the iOS simulator shares the Mac network'
);
assert.strictEqual(
  resolveBaseUrl({ dev: true, hostUri: '', platform: 'ios' }),
  'http://localhost:4000/api/v1',
  'no hostUri at all is survivable'
);
assert.strictEqual(
  resolveBaseUrl({ dev: true, hostUri: '127.0.0.1:8081', platform: 'android' }),
  'http://10.0.2.2:4000/api/v1',
  '127.0.0.1 is loopback too'
);

// --- The override wins in both modes -----------------------------------
const STAGING = 'https://staging.example.com/api/v1';
assert.strictEqual(
  resolveBaseUrl({ dev: true, configured: PROD, override: STAGING, hostUri: '192.168.1.8:8081' }),
  STAGING
);
assert.strictEqual(resolveBaseUrl({ dev: false, configured: PROD, override: STAGING }), STAGING);
assert.strictEqual(
  resolveBaseUrl({ dev: false, override: STAGING }),
  STAGING,
  'an override alone is enough to ship'
);

// --- Called with nothing, a release build still refuses to guess -------
assert.throws(() => resolveBaseUrl(), /No API URL configured/);

console.log('resolveBaseUrl: all checks passed');
