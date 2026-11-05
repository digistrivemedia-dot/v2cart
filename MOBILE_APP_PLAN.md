# Customer Mobile App — Plan

A React Native (Expo) app for **customers only**. Investors, vendors and admins stay on the web —
their surfaces are dense, data-heavy and desktop-shaped, and nothing in this plan builds for them.

Status: **M1–M5 implemented.** Bundles clean for iOS and Android; not yet run on a device.

---

## 1. Scope

| In | Out |
|---|---|
| Email/password login + register | Investor, vendor, admin anything |
| Home (every section the web home has) | Investing, portfolio, analytics |
| Search with the web's filters | Vendor product upload |
| Product detail | Blog, wishlist (phase 2) |
| Cart | Social login (phase 2) |
| Checkout → order placed | Order tracking UI beyond confirmation |

The app talks to the **existing backend unchanged**. No new endpoints are needed — every screen maps
onto a route that already serves the web client.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | Expo SDK 57, **JavaScript** | As requested |
| Routing | `expo-router` | File-based, mirrors their Next.js app structure; built on React Navigation |
| State | **Zustand** | As requested. Two stores: auth, cart |
| Data fetching | **Axios** | As requested. One client with auth + error interceptors |
| Images | `expo-image` | Caching + placeholders; the default `Image` janks in lists |
| Icons | `@expo/vector-icons` (Ionicons) | Vector, one family, no emoji |
| Fonts | `expo-google-fonts` — Rubik (headings) + Nunito Sans (body) | The e-commerce pairing the design skill returns |
| Storage | `expo-secure-store` | JWT belongs in the keychain, not AsyncStorage |

Deliberately **no UI kit** (Paper/NativeBase/Tamagui). The brand is already defined by the web app;
a kit would fight it, and the component set here is small enough that a themed primitives file is
less code than the overrides would be.

---

## 3. Theme — taken from the web app, not invented

Read out of `tilesecommerse/tailwind.config.js` and `src/styles/colors.css`, cross-checked against
what the storefront actually renders:

| Token | Hex | Where it comes from |
|---|---|---|
| `brand.navy` | `#0f1b3c` | web header background |
| `brand.navyDark` | `#0a1329` | header gradient end |
| `brand.gold` | `#d4af37` | header tagline |
| `accent` (primary CTA, prices) | `#f97316` | `orange-500` — prices, primary buttons, hover |
| `accentDark` | `#ea580c` | `orange-600` — pressed state |
| `accentSoft` | `#fff7ed` | `orange-50` — selected chips, badges |
| `ink` | `#0f172a` | `slate-900` |
| `inkSecondary` | `#475569` | `slate-600` |
| `inkMuted` | `#94a3b8` | `slate-400` |
| `border` | `#e2e8f0` | `slate-200` |
| `surface` / `canvas` | `#ffffff` / `#f8fafc` | cards / page |
| `success` `warning` `danger` | `#16a34a` `#f59e0b` `#dc2626` | status |

Everything is consumed as a **semantic token** (`colors.accent`, never `#f97316` inline), so the
palette can move in one file. Spacing is a 4/8 scale, radii and type scale are fixed tokens.

**Light mode only for v1**, stated rather than implied: the web storefront is light-only, and the
skill's rule is that dark mode must be *designed and contrast-tested*, not auto-inverted. Shipping a
half-checked dark theme is worse than not offering one.

---

## 4. Navigation

Bottom tab bar, **4 items** (the skill caps it at 5), icon + label, cart badge:

```
Home · Search · Cart · Account
```

Pushed on top of the tabs (not tabs themselves, so the bar stays visible context):
`product/[id]`, `checkout`, `order-success`, `(auth)/login`, `(auth)/register`.

Auth is **not** a gate on browsing. Customers browse and build a cart logged out; the wall is at
checkout, which is where intent is highest and a sign-up prompt is expected rather than hostile.

---

## 5. Screens

**Login / Register** — email + password, labels above fields (not placeholder-only), show/hide
password toggle, inline validation on blur, errors under the field, `textContentType` set so the OS
autofills. Register posts with no `role`, which the backend defaults to `user`.

**Home** — mirrors the web sections: hero slider (`/sliders/active`), category strip
(`/categories`), then horizontal rails for Trending / Popular / New / Best Seller / Premium /
Exclusive / Classic / Limited, each driven by the product tag. Pull-to-refresh. Skeletons, not
spinners, for anything over 300ms.

**Search** — query bar with debounce, results grid, and a filter sheet carrying the web's filters:
category tree, price range, colour, size, finish, tags; plus sort. Active filters show as removable
chips so the state is never hidden behind a closed sheet.

**Product detail** — image carousel with pager dots, name, price (+ struck MRP), stock state,
variant picker, quantity stepper, highlights, specifications, care instructions, description.
Sticky bottom bar with the real CTA so it's always in thumb reach.

**Cart** — line items with quantity steppers and remove, order summary (items, 18% tax, shipping
free over ₹5,000 — matching the web's `CheckoutForm` exactly), sticky checkout bar, empty state.

**Checkout** — shipping address form, order summary, place order. Honours `PAYMENTS_MOCK`: when the
backend reports mock mode the Razorpay step is skipped exactly as the web does, so the app is
testable without a gateway.

**Account** — profile, my orders, logout.

---

## 6. Non-negotiables carried from the design skill

- Touch targets ≥44pt; 8pt minimum gap between them.
- Safe areas respected on the header, tab bar and every sticky CTA bar.
- Pressed feedback within ~100ms on everything tappable; 150–300ms transitions.
- Body text ≥16px wrapped over truncated; prices in tabular figures.
- Every icon-only control gets an `accessibilityLabel`.
- Colour is never the only signal — stock, errors and status all carry an icon or text.
- Skeletons for >300ms loads; a real empty state and a retry path on every list.

---

## 7. Phases

| Phase | Contents |
|---|---|
| **M1 — Foundation** | Expo scaffold, theme tokens, fonts, axios client + interceptors, zustand stores, UI primitives, tab navigation |
| **M2 — Auth** | Login, register, secure token storage, session bootstrap, account screen |
| **M3 — Browse** | Home (all rails), product card, product detail |
| **M4 — Search** | Query, filter sheet, sort, chips, pagination |
| **M5 — Buy** | Cart, checkout, order placement, confirmation |

---

## 8. Honest limits

- **I cannot run this app here.** No simulator, no device. I verify it by lint and by a Node-level
  import/shape check of the pure modules (theme, pricing, cart math, API layer). First `expo start`
  is on you, and small runtime fixes are likely.
- `localhost` will not resolve from a phone. The API base URL is config-driven and must be set to
  the machine's LAN IP (documented in the app README).
- Variant pricing is the known backend gap (Phase 10): a variant's own price would break the margin
  math. The app shows variants as catalogue choices and prices from the product, matching the fix
  already applied on the web.


---

## 9. What shipped

All five phases landed in one pass.

```
mobile/
  app/_layout.js            fonts, session + cart bootstrap, stack, nav direction
  app/(tabs)/_layout.js     Home · Search · Cart · Account, cart badge
  app/(tabs)/index.js       hero slider, category strip, 8 tag rails, pull-to-refresh
  app/(tabs)/search.js      debounced query, facet filters, sort, active chips
  app/(tabs)/cart.js        lines, steppers, summary, sticky checkout bar
  app/(tabs)/account.js     profile, recent orders, sign out
  app/product/[id].js       gallery, variants, qty, accordions, sticky buy bar
  app/checkout.js           address form, summary, order placement
  app/order-success.js      confirmation (back gesture disabled)
  app/(auth)/login.js       + register.js
  src/theme/                tokens from the web app
  src/api/                  axios client + every endpoint used
  src/store/                zustand: auth (keychain token), cart (AsyncStorage)
  src/components/ui/        Button, Input, Price, Badge, Chip, Stepper, Skeleton, states
  src/utils/                pricing + filtering, both pure, both with runnable checks
```

### Decisions worth recording

- **Client-side facet filtering.** The backend's `SearchFeatures` handles `keyword` and price
  operators but not multi-select facets or sorting. Filtering the keyword result on the client gives
  the web's filter set with no new endpoints, and makes every filter tap instant.
- **Home partitions one request.** Eight tag rails from eight requests would be eight round trips on
  a cold mobile connection; the catalogue is fetched once and split by tag.
- **Auth wall at checkout, not at browse.** Highest-intent moment, lowest-friction prompt.
- **Token in SecureStore, cart in AsyncStorage.** The JWT is a credential; the cart isn't, and would
  risk SecureStore's value-size limit.
- **No UI kit.** The brand already exists on the web; a kit would be fought more than used.

### Verified

- `npx expo export` succeeds for **both iOS and Android** — that compiles every route and resolves
  every import, which is what caught a missing `src/api/endpoints.js`.
- `node src/utils/pricing.check.mjs` — cart totals, asserting the web's exact numbers (a ₹120 tile
  bills ₹341.60 with 18% tax and ₹200 shipping), the free-shipping boundary, variant price
  inheritance, float-safe fractional prices, and a discount that can't go below zero.
- `node src/utils/filtering.check.mjs` — case-insensitive facets, OR within a group and AND across
  groups, all five sorts, non-mutating sort, and chip removal.

### Still open

- **Never run on a device.** No simulator here. Expect small runtime fixes on first `expo start`.
- **Live card payments.** With `PAYMENTS_MOCK=false` checkout stops with a clear message rather than
  creating an unpaid order — the native Razorpay SDK isn't embedded yet. Mock mode works end to end.
- ~~`apiBaseUrl` must be set to a LAN IP~~ — **fixed.** The first emulator run failed with
  "can't reach the server" because the default was `http://localhost:4000`, and on an Android
  emulator `localhost` is the emulator, not the host machine. The client now derives the host from
  Expo's `hostUri` (the address that reached Metro, so it's correct on emulator, simulator and
  physical device alike), ignores a `localhost` override as the known-bad value, falls back to
  `10.0.2.2` on Android, logs the resolved URL on boot, and names the failing URL in the dev error
  message instead of a generic "check your connection".
- Wishlist, reviews, order tracking and address book are not built.
