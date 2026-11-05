# InveztIN — Customer App

React Native (Expo) shopping app for **customers only**. Investor, vendor and admin tools stay on
the web.

## Running it

```bash
cd mobile
npm install
npm start          # then press i / a, or scan the QR in Expo Go
```

### The API address resolves itself

You normally don't configure anything. `localhost` means a different machine on every target:

| Target | What `localhost` means | What the app uses |
|---|---|---|
| iOS simulator | the Mac (shared network) | works either way |
| **Android emulator** | **the emulator itself** | the host, via Metro's address |
| Physical device | the phone | your Mac's LAN IP, via Metro's address |

So the base URL is derived from `hostUri` — the address the app used to reach the Metro dev server,
which is by definition a route back to your machine. Only the port is swapped (8081 → 4000). It
logs what it picked on boot:

```
[api] base URL: http://192.168.1.8:4000/api/v1
```

To override (production, or a non-standard port), add it back to `app.json`:

```jsonc
"extra": { "apiBaseUrl": "https://api.example.com/api/v1" }
```

A `localhost` value there is **ignored on purpose** — it's the setting that silently breaks the
Android emulator.

Requirements either way: the backend running on port 4000, and the phone on the same Wi-Fi as the
Mac if you're using a real device.

**Standalone Android builds** block plain `http://`. That's fine in Expo Go and the simulator; if
you later make a release build against an http API, add `expo-build-properties` with
`usesCleartextTraffic: true`.

### Payments

Checkout honours the backend's `PAYMENTS_MOCK` flag exactly as the web does. With
`PAYMENTS_MOCK=true` in `backend/config/config.env`, the gateway step is skipped and a mock payment
proof is used — so the whole buy flow is testable without Razorpay.

With it set to `false`, checkout **stops with a clear message** rather than creating an unpaid
order: the native Razorpay SDK isn't embedded in this build yet. That's the one deliberate gap.

## Layout

```
app/                     expo-router routes
  _layout.js             fonts, session + cart bootstrap, stack
  (tabs)/                Home · Search · Cart · Account
  product/[id].js        product detail
  checkout.js            address + place order
  order-success.js       confirmation
  (auth)/                login, register
src/
  theme/                 design tokens, taken from the web app
  api/                   axios client + every endpoint used
  store/                 zustand: auth, cart
  components/ui/         themed primitives
  components/product/    ProductCard
  components/search/     FilterSheet
  utils/                 pricing, filtering (pure, with checks)
  hooks/                 useAsync, useDebounced
```

## Checks

The pure logic has runnable assertions — no framework:

```bash
node src/utils/pricing.check.mjs     # cart totals, must match the web exactly
node src/utils/filtering.check.mjs   # search filters and sorting
```

`npx expo export --platform ios` type-checks the whole bundle by actually building it, which is the
quickest way to catch a bad import.

## Theme

Every colour comes from the web storefront (`tailwind.config.js`, `styles/colors.css`): navy
`#0f1b3c` and gold `#d4af37` for brand surfaces, orange `#f97316` for prices and primary actions,
the slate scale for text. All of it lives in `src/theme/index.js` — change it there, not in screens.

Light mode only for now, on purpose: the web storefront is light-only, and a dark theme needs its
own contrast pass rather than an automatic inversion.
