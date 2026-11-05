# Convert Tiles E-commerce → 4-Role Investment Marketplace

Status: **All 10 phases (0–9) implemented and code-reviewed.** Not yet run against a real database/Razorpay — see the Verification section for what's left to test manually.

## Context

The codebase at `backend/` (Express + Mongoose, JWT cookie auth) and `tilesecommerse/` (Next.js 16 App Router, React Query, Tailwind/shadcn) is a working single-vendor tiles store with one admin role. The goal is to turn it into a marketplace with **four roles** — customer, vendor, investor, superadmin — where:

- Vendors list products at a **cost price**.
- Superadmin is the only one who sets the **customer retail price**, the **investor investment price**, and the **fixed investor payout**, per product.
- Investors fund individual *units* of stock (not the whole product) and get their fixed payout back only when a customer buys a funded unit.
- Superadmin keeps whatever's left over as platform profit.
- Everything must be auditable (who got paid what, when) so vendor/investor/superadmin dashboards can show live sales/income figures.

This is a deep structural change (new roles, new financial model, three new dashboards, new client state layer), so it's broken into phases that each leave the app in a shippable state — existing tiles storefront/admin functionality keeps working throughout.

## Locked-in business rules (confirmed with user)

1. **Per-unit FIFO investment matching.** Each investment funds exactly one physical unit of a product's stock. When a unit sells, the system matches the **oldest unmatched investment** for that product (if any exists).
2. **Investor funding is optional**, never a gate. Customers can always buy any in-stock, live-priced product. If the unit they buy happens to be investor-funded, the investor gets paid; if not, superadmin just keeps the full margin on that unit.
3. **Payout waterfall fires at payment-captured time** (same moment as today's stock decrement in `newOrder`), not on delivery. Cancellation reverses it (see #4).
4. **On cancellation/refund, the unit is "re-pooled":** the matched investment is reset to unmatched (available for the next sale) — no cash actually moves for the investor; ledger entries are reversed via offsetting rows, not mutated.
5. **Pricing formula** — ⚠️ **SUPERSEDED by Phase 10.** The four numbers are no longer independent; they all derive from the vendor's listing price and one global margin %. Kept here for historical context only:
   - `vendorPrice` — vendor's cost, always paid to vendor on any sale of their unit.
   - `customerPrice` — retail price (reuses existing `price` field, no rename — see Phase 3).
   - `investorPrice` — amount an investor pays to fund one unit.
   - `investorPayout` — fixed amount an investor receives back when their funded unit sells.
   - Superadmin's profit per sale = `(customerPrice + investorPrice) - vendorPrice - investorPayout` when a matched investment exists, or `customerPrice - vendorPrice` when it doesn't. This is **derived/displayed live**, not typed in directly — superadmin tunes the four inputs and watches their margin update.

## Key existing patterns being reused (not reinvented)

- **Ledger-array pattern** from `backend/models/couponModel.js` (`usedBy[]` + `isValid()`/`canUserUse()`/`calculateDiscount()` instance methods) → template for the new `Investment` model's matching logic.
- **`authorizeRoles(...roles)`** in `backend/middlewares/auth.js` — already generic, just pass new role strings.
- **`SearchFeatures`** in `backend/utils/searchFeatures.js` — chainable `.find()` wrapper reused as-is for vendor-scoped and investor-scoped product listings by prepending a base filter.
- **CRUD controller shape** from `backend/controllers/categoryController.js` (create/getAll/getSingle/update/delete/toggleStatus) → template for new `investmentController.js`, `payoutController.js`.
- **Frontend service+hook layering** from `src/hooks/category/*` and `src/hooks/coupon/*` (`keys.ts` + `queries/use*.ts` + `mutations/use*Mutation.ts`, Zod-validated, `sonner` toasts, React Query cache invalidation) → template for new `src/hooks/investment/*`, `src/hooks/vendorProduct/*`, `src/hooks/payout/*`.
- **Real Zod schema pattern** from `CouponSchema`/`CategorySchema` in `src/schemas/index.ts` (as opposed to the `z.any()` placeholders currently used for `Product`/`Order`) → new schemas must follow this real pattern, and this is a good moment to finally give `Product`/`Order` real schemas since new pricing fields depend on it.
- **Admin layout/guard/sidebar shape** from `src/app/admin/layout.tsx` + `src/components/admin/Sidebar.tsx` → template for `/vendor` and `/investor` layouts. `AdminGuard.tsx` is a redundant duplicate of the inline guard in `admin/layout.tsx` — consolidate both into one reusable `<RoleGuard allow={[...]}>` component used by all four dashboard layouts instead of duplicating the check a 4th and 5th time.
- **`LoadingButton` / `Skeleton` / `blogs/loading.tsx` skeleton style** (`src/components/ui/loadingButton.tsx`, `src/components/ui/skeleton.tsx`, `src/app/admin/blogs/loading.tsx`) → the visual template for all new loading states, instead of the plainer spinner style used in most other `admin/*` routes today.
- **`useAuthMutation`'s existing role-redirect** (`src/hooks/auth/useAuthMutation.ts`, already does `role === 'admin' → /admin`) → extend the same `if/else` chain for vendor/investor/superadmin.

## Drive-by fixes worth bundling in (small, directly touched by this work)

- `backend/routes/orderRoute.js:12` — `GET /admin/orders` currently has **no auth at all** ("Temporarily remove auth for testing"). Must be fixed before this route starts returning investor/vendor payout data.
- `backend/controllers/productController.js` `updateProduct`/`deleteProduct` have **no ownership check** — any admin/superadmin-authorized caller can edit any product. Required fix once vendors can edit their own products.
- Consolidate `AdminGuard.tsx` + the inline guard in `admin/layout.tsx` into one shared `RoleGuard`.

---

## Phase 0 — Performance + Zustand foundation

This phase exists because of a real, measured problem: pages currently feel slow and re-fetch data on every navigation. Investigation found the actual cause is **server-side**, not a missing client store: `src/app/page.tsx` has `export const dynamic = 'force-dynamic'`, and several other pages (`admin/page.tsx`, `admin/products/page.tsx`, `admin/blogs/page.tsx`, some `(user)/*` pages) plus a couple of server actions in `src/app/actions.ts` (`cache: 'no-store'`) do the same — this forces a fresh backend round-trip on every single visit, before any client JavaScript even runs. Zustand lives entirely in the browser, so on its own it cannot fix this. Two different tools for two different jobs:
- **React Query** (already installed, partially configured in `src/providers.tsx` with a 5-minute `staleTime`) is what caches server/API data on the client so switching pages doesn't refetch.
- **Zustand** is for client-only UI state that has nothing to do with the server — sidebar open/closed, active dashboard tab, a multi-step form draft.

Work in this phase:
- `npm install zustand` in `tilesecommerse`. New `src/stores/uiStore.ts` for cross-cutting **client-only UI state** (dashboard sidebar collapsed/expanded, active theme accent) — explicitly not server data; React Query keeps owning products/orders/investments/transactions.
- Audit every `force-dynamic` and `cache: 'no-store'` usage found above. Replace with time-based revalidation (`next: { revalidate: N }`) following the pattern `getCategoryProducts` in `src/app/actions.ts` already uses correctly (`revalidate: 60`), wherever the page doesn't genuinely need per-request freshness. For any page that legitimately needs to stay dynamic (e.g. it reads the auth cookie to personalize output), leave it dynamic but document why inline.
- Audit client-side dashboard pages for raw `fetch`-in-`useEffect` patterns that bypass React Query entirely (e.g. `src/app/admin/orders/page.tsx`) and convert them to the existing hook pattern (`src/hooks/category/*` style) so tab-switching within a dashboard hits cache instead of refetching.

This phase directly benefits every dashboard added in later phases, since vendor/investor/superadmin dashboards will be built on the same React Query + Zustand foundation from day one instead of inheriting the current inconsistency.

## Phase 1 — Backend hardening prerequisites

Small, low-risk, unblocks everything else safely.

- Fix `orderRoute.js` `GET /admin/orders` to require `isAuthenticatedUser, authorizeRoles("admin","superadmin")`.
- Add an ownership check in `productController.js`: extract a helper `isOwnerOrAdmin(req, product)` and call it at the top of `updateProduct`/`deleteProduct`; return 403 if `req.user.role === 'vendor'` and `product.user.toString() !== req.user.id`.
- Fix the `req.body.user = req.user.id` overwrite bug in `updateProduct` (currently reassigns creator on every update) — only set `user` on create, never on update.

## Phase 2 — Roles & auth foundation

**Backend:**
- `backend/models/userModel.js`: extend `role` enum to `['user','vendor','investor','admin','superadmin']`. Add embedded profile blocks (same convention as existing `cart`/`wishlist`/`addresses` sub-docs):
  ```js
  vendorProfile: { businessName: String, gstNumber: String, payoutDetails: { accountName, accountNumber, ifsc, upiId }, approvalStatus: {type:String, enum:['pending','approved','rejected'], default:'pending'} },
  investorProfile: { payoutDetails: {...same shape...}, approvalStatus: {type:String, enum:['pending','approved','rejected'], default:'pending'} }
  ```
- `backend/controllers/userController.js` `registerUser`: accept optional `role` (`'vendor'|'investor'`, default `'user'`) and matching profile fields; new vendor/investor registrations start with `approvalStatus:'pending'`.
- New middleware `requireApproved(profileKey)` in `backend/middlewares/auth.js`, used on vendor/investor mutation routes (creating products, placing investments) — blocks until superadmin sets `approvalStatus:'approved'`.
- Extend `updateUserRole` admin endpoint (already generic) — no controller change needed, just confirm it can set the new enum values; add a dedicated `PUT /admin/user/:id/approve` action (or reuse `updateUserRole`) for superadmin to flip `approvalStatus`.

**Frontend:**
- `src/lib/auth/client.ts`: `authClient.signUp.email` gains optional `role`/profile params; `useSession()` unchanged (already reads whatever `user` object the backend returns, cookie-stored).
- New shared `src/components/RoleGuard.tsx` (`allow: Role[]`) replacing the duplicated logic in `admin/layout.tsx` and `AdminGuard.tsx`.
- `src/hooks/auth/useAuthMutation.ts`: extend the `onSuccess` redirect chain — `vendor → /vendor`, `investor → /investor`, `superadmin → /admin` (superadmin keeps using the admin shell, see Phase 8), `admin → /admin`, else `/`.
- Registration form(s): add a role selector (Customer / Become a Vendor / Become an Investor) that shows the matching profile fields conditionally.

## Phase 3 — Product pricing/listing model

**Backend — `backend/models/productModel.js`:**
- Keep `price` (= customer price) and `cuttedPrice` exactly as-is — zero churn for existing storefront/cart/order/coupon code that already reads `price`.
- Add new fields: `vendorPrice: Number`, `investorPrice: Number`, `investorPayout: Number`, `pricingStatus: {enum:['pending_pricing','priced'], default:'pending_pricing'}`, `listingStatus: {enum:['draft','pending_approval','live','rejected','paused'], default:'draft'}`, `investableUnits: Number` (defaults to `stock` at creation — caps how many units of this product can ever be investor-funded; superadmin can lower it).
- Existing `user` field is reused as the vendor reference (already `ref: 'Product'... ref:'User'`, required, set at creation) — no rename.
- Old admin-created tile products: backfill script sets `pricingStatus:'priced'`, `listingStatus:'live'` for all pre-existing products so nothing disappears from the storefront (see migration note in Phase 9).

**Backend — `productController.js` / `productRoute.js`:**
- `createProduct`: when `req.user.role === 'vendor'`, force `listingStatus:'draft'`, ignore any `price`/`investorPrice`/`investorPayout` in the body (strip them server-side — vendor only supplies `vendorPrice`).
- New endpoint `PUT /admin/product/:id/pricing` (superadmin only): sets `price`, `investorPrice`, `investorPayout`, `investableUnits`, flips `pricingStatus:'priced'`; separate `PUT /admin/product/:id/listing-status` for approve/reject/pause (`listingStatus`).
- `getAllProducts`/`getProducts`/`getProductDetails` (public/customer-facing): add base filter `{ listingStatus: 'live' }`.
- New `GET /vendor/products` (vendor-scoped list, filters `{ user: req.user.id }`, reusing `SearchFeatures`); vendor's own `updateProduct` calls now blocked from touching pricing fields (same strip logic as create).
- New `GET /investor/products` (investor-facing list): filter `{ listingStatus:'live', investorPrice: {$ne:null} }` — this powers the investor page the user described ("same products, but only an Invest button").

**Frontend:**
- Real Zod schemas for `Product` (finally replacing the `z.any()` placeholder in `src/schemas/index.ts`) including the new pricing fields, following `CouponSchema`'s style.
- `src/components/admin/SimpleProductForm.tsx` / `CreateProductForm.tsx` / `EditProductForm.tsx`: fork into a vendor variant that only exposes `vendorPrice` (not `price`/`investorPrice`/`investorPayout`), reusing the same form components/validation, gated by a `mode: 'vendor' | 'superadmin'` prop rather than duplicating the whole form.
- New superadmin-only "Pricing" panel component used inside `/admin/products/[id]` to set the three superadmin-controlled numbers, with the live-derived superadmin-margin readout described in the locked-in rules.

## Phase 4 — Investment + Ledger engine (the financial core)

**Backend — new `backend/models/investmentModel.js`:**
```js
{
  investor: ObjectId ref User, required,
  product: ObjectId ref Product, required,
  amountInvested: Number, required,      // snapshot of product.investorPrice at invest time
  expectedPayout: Number, required,      // snapshot of product.investorPayout at invest time
  status: {enum:['unmatched','matched'], default:'unmatched'},
  matchedOrder: ObjectId ref Order, default: null,
  matchedAt: Date,
  createdAt: Date default now
}
// index: { product: 1, status: 1, createdAt: 1 }  -- for FIFO lookups
```

**Backend — new `backend/models/transactionModel.js`** (the ledger, one row per money movement, queried by every dashboard):
```js
{
  type: {enum:['investor_investment','vendor_earning','investor_payout','superadmin_profit','investor_reversal','superadmin_reversal']},
  user: ObjectId ref User,      // whose balance this row affects
  product: ObjectId ref Product,
  order: ObjectId ref Order, default: null,
  investment: ObjectId ref Investment, default: null,
  amount: Number,               // positive = credit, negative = reversal
  createdAt: Date default now
}
```

**Backend — new `investmentController.js` (mirrors `categoryController.js` CRUD shape):**
- `POST /investor/invest` — body `{ productId }`. Validates product `listingStatus:'live'`, `investorPrice` set, and `investableUnits` not exhausted (count existing `Investment` docs for that product). Creates `Investment{status:'unmatched'}` + a `Transaction{type:'investor_investment'}` row.
- `GET /investor/investments/me` — investor's own investments with populated product + computed status label.
- `GET /investor/earnings` — aggregate `Transaction` by type for `req.user.id`.

**Backend — `orderController.js` `newOrder`, extended:**
- After today's `updateStock` loop, add a settlement step per unit of `quantity` in each `orderItem`:
  1. `Investment.findOneAndUpdate({product: item.product, status:'unmatched'}, {status:'matched', matchedOrder: order._id, matchedAt: Date.now()}, {sort:{createdAt:1}})` (oldest first — FIFO).
  2. If matched: write `Transaction` rows — `vendor_earning` (+`product.vendorPrice`, user=vendor), `investor_payout` (+`investment.expectedPayout`, user=investor), `superadmin_profit` (+ derived remainder per the locked-in formula, user=null/system).
  3. If not matched: write `vendor_earning` (+`vendorPrice` if set) and `superadmin_profit` (+`customerPrice - vendorPrice`).
- Store which `Investment`(s) got matched on the order item (`orderItems[i].matchedInvestment: ObjectId`) so cancellation can find them directly instead of re-querying.

**Backend — `orderController.js` `updateOrder`, extended (cancellation path):**
- When status flips to `"Cancelled"`: for each `orderItem.matchedInvestment` present, reset that `Investment` to `{status:'unmatched', matchedOrder:null, matchedAt:null}` (re-pooled per locked-in rule #4), and insert **reversal** `Transaction` rows (`investor_reversal`, `superadmin_reversal`, negative amounts) offsetting the original three rows — never mutate/delete the original rows, so the ledger stays a true audit trail.

**Backend — new routes:** `backend/routes/investmentRoute.js` (mounted at `/api/v1` in `app.js` alongside the existing route list), gated with `isAuthenticatedUser, authorizeRoles("investor"), requireApproved('investorProfile')` for the invest/earnings endpoints.

**Frontend:** `src/hooks/investment/*` (keys/queries/mutations, following the `src/hooks/coupon/*` shape) for `useInvestments`, `useInvestMutation`, `useInvestorEarnings`.

## Phase 5 — Shared UI foundation

- New `src/components/RoleGuard.tsx` (Phase 2) + a small `src/components/DashboardShell.tsx` (sidebar + content area layout extracted from `admin/layout.tsx`'s markup) reused by all four dashboard layouts to avoid copy-pasting the `flex min-h-screen` / `ml-64` shell four times.
- Add `loading.tsx` to every `admin/*` route currently missing one (`products`, `orders`, `categories`, `coupons`, `customers`, `enquiry`, `settings`), following the real skeleton style of `admin/blogs/loading.tsx` rather than the plain spinner in `admin/loading.tsx`. Same skeleton components get reused for the new vendor/investor routes so all four dashboards feel visually consistent from day one.
- Builds on the Zustand store and React Query cleanup already done in Phase 0.

## Phase 6 — Vendor dashboard (`/vendor`)

New route tree mirroring `/admin`'s structure:
- `src/app/vendor/layout.tsx` — `<RoleGuard allow={['vendor']}><DashboardShell sidebar={<VendorSidebar/>}>...`
- `src/app/vendor/page.tsx` — overview cards: product count, total units sold, lifetime income (sum of `vendor_earning` + `investor_reversal`-adjusted via the `/vendor/stats` endpoint), pending-approval count.
- `src/app/vendor/products/page.tsx` + `create/page.tsx` + `[id]/edit/page.tsx` — reuse `SimpleProductForm`/`EditProductForm` in `mode:'vendor'` (Phase 3), list via `GET /vendor/products`.
- `src/app/vendor/orders/page.tsx` — read-only: order line items belonging to this vendor's products (new `GET /vendor/orders` filtering `Order.orderItems.product` against the vendor's product IDs).
- `src/app/vendor/income/page.tsx` — table over `GET /vendor/transactions` (their `Transaction` rows), grouped by product.
- New backend endpoints: `GET /vendor/stats`, `GET /vendor/orders`, `GET /vendor/transactions`, all gated `authorizeRoles("vendor")` + scoped to `req.user.id` server-side (never trust a client-supplied vendor id).

## Phase 7 — Investor dashboard (`/investor`) + investor-facing product page

- `src/app/investor/layout.tsx`, `page.tsx` (overview: total invested, total returned, active/matched investment counts).
- `src/app/investor/products/page.tsx` — the page the user described: same product grid/cards as the storefront, sourced from `GET /investor/products` (Phase 3), but the card renders an **"Invest ₹{investorPrice}"** button (calling `useInvestMutation`) instead of "Add to cart" — reuse the existing product-card component with a `variant:'investor'` prop rather than forking it.
- `src/app/investor/investments/page.tsx` — list from `useInvestments()`, status pill (Unmatched/Matched/Settled).
- `src/app/investor/earnings/page.tsx` — table over `useInvestorEarnings()`.

## Phase 8 — Superadmin pricing/approval/reports (extends `/admin`)

Keep `/admin` as the shared shell for `admin` + `superadmin` (matches existing `authorizeRoles("admin","superadmin")` convention everywhere), but gate the *new* sensitive screens to `superadmin` only:
- `src/app/admin/products/[id]/page.tsx` — add the Pricing panel from Phase 3 (visible only if `session.user.role === 'superadmin'`), plus approve/reject/pause controls for `listingStatus`.
- `src/app/admin/vendors/page.tsx` (new) — list users with `role:'vendor'`, approve/reject `vendorProfile.approvalStatus` (`PUT /admin/user/:id/approve`, Phase 2).
- `src/app/admin/investors/page.tsx` (new) — same for investors.
- `src/app/admin/reports/page.tsx` (new) — aggregate `Transaction` totals platform-wide (`GET /admin/transactions/summary`, superadmin-only): total superadmin profit, total vendor payouts, total investor payouts, filterable by date range.
- Add the new items to `Sidebar.tsx`'s `sidebarItems` array, conditionally rendered when `role === 'superadmin'`.

## Phase 9 — Customer-facing integration, data migration, polish

- Home page (`src/app/page.tsx`) and search/category listing (`src/app/(store)/*`) already call the public product endpoints — no frontend change needed once Phase 3's `{listingStatus:'live'}` filter is live server-side; just re-verify nothing hardcodes an assumption about every product being visible.
- One-off migration script (`backend/scripts/backfillMarketplaceFields.js`, same style as existing `backend/scripts/fix-tile-units.js`) — sets `pricingStatus:'priced'`, `listingStatus:'live'` on every pre-existing product so the current catalog doesn't vanish behind the new gate.
- `src/app/(user)/profile/page.tsx` stays customer-only (no change needed) — `RoleGuard`/redirect logic from Phase 2 ensures vendor/investor/superadmin land on their own dashboards instead of the customer profile page after login.
- Sweep: fix the `admin/orders/page.tsx` client-side ad-hoc fetch (flagged by exploration as duplicating the existing `admin/orders/actions.ts` server action) to use the same server-action pattern, since orders now carry sensitive settlement data best fetched server-side with the httpOnly cookie rather than a `localStorage` bearer token. (This may already be resolved by the Phase 0 React Query cleanup, depending on how that sweep goes.)

## Verification

- **Performance (Phase 0):** confirm the pages that had `force-dynamic`/`no-store` removed now serve from cache on repeat navigation (check response timing / Next.js cache logs) while still showing fresh data within their revalidate window.
- **Backend:** exercise the full money flow with `curl`/Postman against a local server (`npm run dev` in `backend/`): register a vendor (pending) → superadmin approves → vendor creates product → superadmin sets pricing (`price`, `investorPrice`, `investorPayout`) and flips `listingStatus:'live'` → register + approve an investor → investor invests → verify `Investment.status:'unmatched'` → customer places order for that product → verify `Investment` flips to `'matched'`, three `Transaction` rows appear with the right amounts, `Product.stock` decrements → cancel that order via `PUT /admin/order/:id` → verify the `Investment` resets to `'unmatched'` and reversal `Transaction` rows appear.
- **Frontend:** run `npm run dev` in `tilesecommerse/`, log in as each of the four roles and confirm: correct dashboard redirect, vendor can create a product but not set customer/investor pricing, superadmin pricing panel's live margin readout matches the formula, investor product page shows an Invest button (not Add to Cart) and updates after investing, customer home/search never shows a `draft`/`pending_approval` product.
- Re-run existing storefront flows (browse → cart → checkout → Razorpay) end-to-end after Phase 3/9 to confirm the `listingStatus` filter didn't break the existing customer path.

---

## How we'll work from here

1. You read/edit this document until it matches what you want.
2. Once you confirm, I implement **one phase at a time**, only when you explicitly tell me to start that phase.
3. Each phase lands as its own reviewable change — I won't jump ahead into the next phase on my own.

---

## Phase 10 — Margin-based pricing rework (supersedes rule #5)

**Confirmed with user 2026-10-11.** Inverts the pricing direction: margin is *carved out of* the
vendor's listing price instead of *added on top of* a vendor cost. Three global percentages collapse
to one. Investments stop being immutable snapshots — a vendor price drop repays the difference.

### The law

```
f              = 1 + marginPct/100          // marginPct = the single global setting
price          = P                           // P = the price the VENDOR lists; customer pays exactly this
vendorPrice    = P / f                       // what the vendor RECEIVES  (field meaning changes!)
investorPrice  = P / f                       // what an investor PAYS     (identical to vendor's net)
investorPayout = P                           // what the investor RECEIVES when their unit sells
```

Worked examples at `marginPct = 20`:

| Vendor lists | Customer pays | Vendor gets | Investor pays | Investor gets | Investor return | Platform (funded) | Platform (unfunded) |
|---|---|---|---|---|---|---|---|
| 120 | 120 | 100 | 100 | 120 | +20% | **0** | 20 |
| 90 | 90 | 75 | 75 | 90 | +20% | **0** | 15 |

Decisions behind this (all confirmed):

1. **Divide by `(1+margin)`, never multiply by `(1−margin)`.** `÷1.2` is the only rule that makes
   120 → 100/20 *and* gives the investor exactly the margin % as return. `×0.8` would pay 72 on a 90
   listing and yield a 25% return on a 20% margin. So: 90 → investor pays **75** (not 72), and the
   refund in the drop case is **₹25** (not ₹28).
2. **Platform earns nothing on an investor-funded unit.** The margin *is* the investor's return —
   it's the price of their capital. Money in (customer `P` + investor `P/f`) exactly equals money out
   (vendor `P/f` + investor `P`). The platform keeps the full margin only on units no investor funded.
   `orderController.js`'s existing `superadmin_profit` formula already computes this correctly and
   **needs no change** — because `vendorPrice` keeps meaning "what the vendor is paid".
3. **Price drop → real Razorpay partial refund** against the original payment, plus a ledger row.
4. **Price rise → existing investors are left completely untouched.** Their original
   `amountInvested`/`expectedPayout` stand, so their agreed return is intact; the residual stays with
   the platform. Raising their payout for free would push the platform negative, and topping up their
   investment would need a card re-consent flow that doesn't exist.
5. **Only `unmatched` investments are ever repriced.** A matched one is closed business.

### Reprice-and-refund flow (the only genuinely new logic)

New `backend/utils/repriceInvestments.js`, called from every place `price` changes — vendor product
update, superadmin pricing panel, and the global settings recalculate loop:

```
for each unmatched Investment on this product:
    newAmount = product.investorPrice            // = P/f
    if newAmount >= inv.amountInvested: skip     // price rose → decision #4
    refund = inv.amountInvested - newAmount
    razorpay partial refund on inv.paymentId for `refund`
    inv.amountInvested  = newAmount
    inv.expectedPayout  = product.investorPayout // = P
    Transaction { type:'investor_refund', amount: -refund }
```

- Repeated drops are safe: each refund is computed against the investment's *current* amount, so
  cumulative refunds can never exceed what the investor originally paid.
- A failed Razorpay refund still reprices and still writes the ledger row, and flags the Investment
  so the money owed is never silently lost. A retry job is deliberately out of scope (`ponytail:` note).

### File-by-file

**Backend**
- `models/platformSettingsModel.js` — three pcts → single `marginPct`; rewrite the formula comment.
- `utils/pricingCalculator.js` — rewrite: takes the listing price, returns all four numbers. Carries an
  `assert`-based self-check for the 120 / 90 cases.
- `models/productModel.js` — correct the now-wrong `vendorPrice`/`investorPrice`/`investorPayout`
  comments, and **remove `useGlobalPricing`**. With one global margin there is nothing left to opt
  out of: `vendorPrice` must always equal `price/(1+marginPct)`, so a product excluded from the
  global recalculate would quietly pay its vendor at a stale margin. Per-product control now lives
  entirely in `price` itself, which the vendor (or superadmin) sets freely.
- `models/transactionModel.js` — add `investor_refund` to the enum.
- `models/investmentModel.js` — add `refundFailed` flag. (Refund totals stay derivable from the ledger.)
- `utils/repriceInvestments.js` — **new**, as above, with its own self-check.
- `controllers/productController.js` — a new `applyListingPrice()` helper replaces a submitted price
  with the full derived set, so the calculator is the *only* thing that can write
  `vendorPrice`/`investorPrice`/`investorPayout`. `price` leaves `SUPERADMIN_ONLY_FIELDS` (the vendor
  owns it now) and `vendorPrice` joins it (it's derived). `updateProductPricing` collapses to listing
  price + investable units. Every path that moves the price calls `repriceInvestments`.
- `controllers/settingsController.js` — one field in/out; recalc derives from `product.price` and also
  writes `vendorPrice`, then calls `repriceInvestments` per product. No opt-out (see above).
- `controllers/investmentController.js` + `controllers/reportController.js` — net `investor_refund` into
  the invested totals and the payments feed.
- `orderController.js` — the settlement *formula* is unchanged (see decision #2), but the inline
  superadmin-profit expression moved into `calculateUnitProfit()` in `pricingCalculator.js` so the
  pricing and the settlement that has to agree with it live together and can be tested as one.
- `routes/settingsRoute.js` — vendors may now READ the margin (not change it). They're the ones it's
  deducted from, and the form can't show "you receive ₹X" without it.

**Frontend**
- `components/admin/GlobalPricingBar.tsx` — three inputs → one "Platform Margin %", new formula caption.
- `hooks/admin/queries/usePricingSettings.ts`, `useUpdatePricingSettings`, `schemas/index.ts` — type change.
- `components/vendor/VendorProductForm.tsx` — "Your Cost Price" → "Listing Price (customer pays this)",
  with a live "you receive ₹X, platform margin ₹Y" readout so the vendor sees they net less than they typed.
- `components/admin/ProductPricingPanel.tsx` — four independent inputs → listing price + investable
  units, everything else a derived readout. "Reset to Global Pricing" is gone along with
  `useGlobalPricing`. Both this panel and the margin bar confirm before an action that issues real
  refunds.
- `admin/products/page.tsx`, `vendor/products/page.tsx` — column labels that say "cost".
- Investor pages need no change; their ROI readout now simply always equals `marginPct`.

**Migration** — one-time script in `backend/scripts/`, following the `backfillMarketplaceFields.js` pattern.

### Bugs found in the post-implementation audit (all fixed)

1. **`invest()` compared cart totals as floats.** `investorPrice` is `listingPrice/(1+margin)` and so is
   usually fractional; summing those across a cart lands on `29.159999999999997` while the gateway
   reports a clean `2916` paise, so a strict `!==` rejected a *correct* payment the investor had
   already been charged for. A sweep found 6,874 failing carts. Now compared as integer paise. This
   bug pre-dated Phase 10 but Phase 10 made fractional investor prices the norm rather than the
   exception, so it went from rare to common.
2. **Cancelling an order re-pooled investments at stale terms.** `reverseSettlement` flips a matched
   investment back to `unmatched`, and `repriceInvestments` deliberately skips matched ones — so an
   investment made at 120, matched, then cancelled after the vendor dropped to 90 sat unmatched owing
   its holder a ₹120 payout on a ₹90 product. The next sale of that unit settled at **−₹5** for the
   platform, and the investor never got the refund they were owed. `reverseSettlement` now reprices
   after re-pooling.
3. **The margin-bar confirmation was backwards.** It warned when *lowering* the margin, but it's
   *raising* it that triggers refunds: a bigger margin makes `listingPrice/(1+margin)` smaller, so
   every investor holding an unsold unit is over-invested. Raising the margin also cuts what vendors
   receive, which the dialog now says.
4. **`refundFailed` was cleared by the next successful refund**, hiding an unpaid debt from an earlier
   failure. Now sticky.
5. **Changing the margin published unreviewed listings.** The recalculate loop flipped
   `draft`/`pending_approval` products to `live`, against the approval flow the rest of the code
   enforces. Repricing is not an approval decision — it no longer touches `listingStatus` at all.

### Known gaps accepted in this phase

- **Coupons on investor-funded units send the platform negative.** Customer pays 81 on a 90 listing, but
  the investor is still owed 90 and the vendor 75. `settleOrder` uses `product.price` and ignores the
  discount, so the loss is currently invisible in the ledger. Not fixed here — flagged for its own phase.
- Sub-paisa rounding residue (e.g. `100/1.2 = 83.33`) is absorbed by the platform.
- **Product variants bypass the margin model entirely — the largest remaining hole.** Checkout charges
  `variant.price` (see `getPriceForSize` in `CheckoutForm.tsx`), but settlement pays the investor
  `product.price` and the vendor `product.price/(1+margin)`. On a variant priced ₹200 under a parent
  priced ₹120, the platform collects ₹200 and books a ₹0 margin, so ₹80 of real cash never appears in
  the ledger; priced the other way it's a silent real loss. Variants have no `vendorPrice`/
  `investorPrice`/`investorPayout` of their own and no per-variant investment units. Pre-existing, but
  it matters far more now that a funded unit's ledger margin is exactly ₹0 — there is no buffer left to
  absorb a discrepancy. Needs its own phase (per-variant pricing + per-variant FIFO), or a rule that
  investable products may not have variants.
- `order.totalPrice` includes 18% tax and shipping, so it is deliberately not comparable to the
  ledger, which tracks entitlements rather than cash. There is no cash-vs-entitlement reconciliation
  report; nothing would surface a gap between what was collected and what was owed.
- No retry mechanism for a Razorpay refund that fails; failures are flagged on the Investment
  (`refundFailed`) for manual handling, with the offsetting ledger row written either way so the debt
  is never lost.
- Price drops under ₹1 per unit don't trigger a refund (Razorpay's floor is a rupee, and that size of
  gap is just rounding). The investment keeps its slightly-better old terms, so the ≤₹1 lands on the
  platform, never on the investor — see `MIN_REFUND` in `utils/repriceInvestments.js`.

### Verification for this phase

- `node utils/pricingCalculator.js` — the derivation, including the exact 120→100/20 and 90→75/15 cases.
- `node utils/marginScenarios.test.js` — all four scenarios end-to-end through the real pricing +
  settlement formulas, plus the invariants that a funded sale never leaves the platform negative and
  never leaves the investor short, swept across margins 0–100% and listing prices ₹1–₹12,345.
- `node scripts/migrateToMarginPricing.js --dry-run` — prints every product's old/new vendor net and
  every refund it would issue, without writing anything or moving money.

---

## Phase 11 — Investor decision analytics

Phase 10 had a side effect nobody asked for: since every product now returns exactly `marginPct`,
**return rate stopped being a way to tell two listings apart**. The investor browse page was built
around it — a "Return: High to Low" sort, min/max ROI filters, and "Avg Return / Best Return" headline
stats — and all of it silently became a no-op that renders the same number on every card.

What still varies is **how long the capital is tied up**, which is a function of two things:

```
velocity      = units of this product selling per week
queueAhead    = unmatched investments already in front of yours (FIFO)
estDaysToSale = (queueAhead + 1) / velocity, in days
annualised    = roi × 365 / estDaysToSale
```

Annualised return is the new headline comparison: 20% back in 30 days and 20% back in 2 years are the
same flat number and completely different investments. In testing, three listings all showing
"+20.0% return" came out at **2607% / 174% / 17%** per year.

### Backend

`getInvestorProducts` gained two aggregations (run in parallel with the existing one):

- **Orders** → units sold per product per week for the last 12 weeks, excluding cancelled orders.
  Bucketed with `$floor($subtract/WEEK_MS)` arithmetic rather than `$dateTrunc` so it works on older
  MongoDB.
- **Investments** → `unmatched` (the FIFO queue depth), `matched`, and summed match duration for a
  real observed `avgDaysToMatch` rather than a modelled one.

New per-product fields: `salesByWeek[12]`, `unitsSoldRecent`, `unitsSoldWindow`, `queueAhead`,
`unitsMatched`, `avgDaysToMatch`.

### Frontend

- **`lib/investor/metrics.ts`** — single derivation shared by the cards, the filters and the sort
  comparators so they can't drift. Velocity prefers the recent 4 weeks and falls back to the full 12
  so a product that just started moving isn't dragged down by dead weeks. No velocity yields `null`,
  never `0` or `Infinity` — "unknown" is never rendered as "instant".
- **`metrics.check.ts`** — runnable assertions (`node --experimental-strip-types`), covering the
  worked scenarios, the liquidity boundaries, and a NaN sweep over a product with no fields set.
- **`InvestorCharts.tsx`** — a 12-week sales sparkline, a funding meter, a liquidity badge and a stat
  tile. Plain divs; a 12-bar sparkline doesn't justify a charting dependency.
- **`PortfolioLiquidity.tsx`** on the investor dashboard — waiting capital bucketed by how fast the
  product behind it is selling, as a stacked bar plus a per-product exposure table. This is the
  "how much should I put in" half: it makes concentration in slow stock visible.
- Filters: min/max ROI replaced by **liquidity buckets**, **max wait**, and **min annualised return**.
  Sorts: the two ROI sorts replaced by annualised, fastest-to-sell, velocity, and shortest-queue.
  Headline stats: Avg/Best Return replaced by best annualised, typical wait, fast-moving count, and
  capital required to take every open unit.

### Data-viz rules followed

One series over time gets **one hue** (a light→dark ramp would double-encode what bar length already
says). The series hue is the app's own emerald-600, validated against the white chart surface —
emerald-500 was rejected at 2.54:1 contrast. Liquidity uses the reserved status palette and always
ships an **icon + text label**, so state never depends on colour alone. Zero weeks render as a 2px
baseline stub rather than a gap, so "sold nothing" reads as data instead of missing data.

### Caught by rendering it and looking (the step that's easy to skip)

- **All 12 sparkline tooltips opened at once.** `ProductItem`'s card root already carries a bare
  `group` class for its image hover, and `group-hover:` matches *any* `.group` ancestor — so hovering
  anywhere on the card popped every tooltip into one unreadable black band. Fixed with a named group
  (`group/bar` + `group-hover/bar:`).
- A real ₹200 exposure rendered as "0%" next to its own rupee figure. Non-zero now shows `<1%`.
- One dominant holding pushed the other stacked-bar segments below a pixel; segments now have a 4px
  floor.


---

## Phase 12 — Per-product margin override

Phase 10 collapsed pricing to one global margin and deliberately removed the per-product escape
hatch. That went too far: admin needs a global default **and** the ability to price one product
differently. Both now exist.

### How the override is modelled (and why not a flag)

`Product.marginPct` is nullable — null means "follow the global margin". It stores the product's
**own margin**, not a flag that excludes it from recalculation. That distinction is the whole point:

- An *opt-out flag* (the old `useGlobalPricing`) meant a skipped product kept whatever `vendorPrice`
  it had when the global rate last changed — a silently stale number that pays the vendor wrong.
- An *override value* means every recalculation still visits every product; it just resolves which
  margin applies. An overridden product recomputes to the same numbers instead of being skipped, so
  `vendorPrice` can never drift out of sync with the margin that produced it.

```
resolveMarginPct(product, settings) = product.marginPct ?? settings.marginPct
```

`??` not `||`, so an explicit **0% override is honoured** rather than falling back to the global rate.

### Where it applies

| Surface | Behaviour |
|---|---|
| Global margin bar (admin products page) | Sets the default. Recalculates every product; those with an override recompute to the same numbers and the response reports how many were kept. |
| Product pricing panel | New "Margin % for this product" field. Empty = follow global (placeholder shows the global rate). A **Use global** button clears it. The derived split and the refund warning both recompute against the effective margin. |
| Admin products grid | Products with an override carry a `N% margin` badge, so they're visible without opening each one. |
| Vendors | `marginPct` is in `SUPERADMIN_ONLY_FIELDS` — a vendor can never set their own margin. |

`marginPct` is tri-state over the wire: a number sets the override, explicit `null` clears it, and
omitting the key leaves the stored value alone.

Editing a product's price elsewhere (vendor edit form, admin catalogue form) passes the existing doc
into `applyListingPrice`, so an override is preserved rather than silently reverting to global on the
next unrelated edit.

### Checks

`node utils/pricingCalculator.js` and `node utils/marginScenarios.test.js` both cover it: an override
wins over the global rate, null and `{}` follow it, an explicit 0% does not fall through, two products
at the same listing price price differently, and moving the global margin moves the follower while
leaving the overridden product untouched.

---

## Payment gateway switch (`PAYMENTS_MOCK`)

A single env flag in `backend/config/config.env` bypasses Razorpay end to end, so the money flow can
be exercised without real charges or refunds:

```
PAYMENTS_MOCK=true    # fake payments — no charges, no refunds, no credentials needed
PAYMENTS_MOCK=false   # live Razorpay (also the default when the flag is absent)
```

Nothing is deleted or commented out — flipping it back to `false` restores the real gateway with no
other edits. The flag is **off by default**, so an absent or misspelled value fails safe to live.

### How it works

`utils/razorpayInstance.js` owns the whole switch and returns a mock client exposing the same
`orders.create` / `payments.fetch` / `payments.refund` surface as the real one, so no caller changes
shape. It also exports `verifyPaymentSignature()`, which replaced the duplicated inline HMAC blocks
in `razorpayController` and `investmentController` — one place now decides what a valid payment is.

The mock is **stateless**: the amount is encoded into the payment id (`mock_pay_<paise>_<rand>`) so
`payments.fetch` reports the right amount without a store, and a server restart mid-test doesn't
break an in-flight payment. That matters because `invest()` re-checks the paid amount against the
cart total in paise before writing any Investment rows — mock payments go through that same check.

On the client, `POST /payment/razorpay/order` returns `mock: true` plus a ready-made `mockPayment`
proof; both checkout flows skip opening the Razorpay modal and submit that proof instead. Everything
after that point — signature verification, amount matching, settlement, FIFO matching, refunds — runs
exactly as it does with a real payment.

### Safety properties (asserted)

- While mocked, **only** `mock_pay_*` ids are accepted; a real-looking id is rejected and
  `payments.fetch` throws on it.
- While live, real HMAC signatures verify and a `mock_pay_*` id is rejected — so leaving the flag on
  in one environment can't let forged payments through in another.
- Price-drop refunds log `[PAYMENTS_MOCK] Pretend refund of ₹X on <id>` and report success, so the
  refund branch of `repriceInvestments` is exercised rather than skipped.

---

## Phase 13 — Portfolio analysis

`/investor/investments` was a five-column table (product, invested, payout, status, date) that
couldn't answer the questions an investor actually has: which products made me money, how much came
back, and how long my capital was tied up.

### The distinction the page is built around

Three numbers are easy to conflate, and conflating them is how a portfolio screen lies:

| | Meaning |
|---|---|
| **At risk** | capital in units that haven't sold |
| **Realised** | profit from units that HAVE sold — cash that actually moved |
| **Pending** | profit the unsold units are expected to make, not earned yet |

They're never summed into a single "profit" figure.

A fourth complication is specific to this platform: `amountInvested` is a **moving target**. A vendor
price drop rewrites it in place and refunds the difference, so the original figure no longer exists
anywhere. "What did I put in" is therefore answered as *current amount + what came back*, and the
refund is surfaced per unit rather than silently changing a number the investor remembers.

### Backend

`myInvestments` now attaches per-unit cash history, summed from the ledger rather than inferred from
the current snapshot:

- `refundedTotal` — capital returned by price drops (`investor_refund` rows, stored negative)
- `realisedPayout` — what actually paid out (`investor_payout` + `investor_reversal`, so a cancelled
  order nets to zero instead of a phantom gain)

### Frontend

- **`lib/investor/portfolio.ts`** — groups units into per-product positions and rolls those into
  portfolio totals. Shared by the tiles, the rows and the sorting so they can't disagree.
- **KPI row** — at risk / realised / pending / realised return / avg time to sell / products.
- **Refund notice** — explains any capital returned by price drops, and flags refunds that failed to
  reach the payment method and are still owed.
- **Positions table** — one row per product (units, capital, avg buy price, realised, pending,
  return, timing), expanding to the individual units with the exact date each was funded and sold,
  its profit and ROI, how long it was held, and any refund against it.
- **Controls** — search, All / Awaiting sale / Sold, and five sorts (recent, largest, best return,
  longest held, most units).

### Checks

`node --experimental-strip-types src/lib/investor/portfolio.check.ts` covers the roll-up, the
price-drop case, multi-product totals, a NaN sweep on a bare record, and one subtle guard: a unit
matched **before** the ledger carried per-investment rows reports `realisedPayout: 0`, which would
otherwise render as a total loss of its capital — it falls back to `expectedPayout` instead.

---

## Phase 14 — Bug fixes from the first live test run

### 1 + 4 (one root cause): `investableUnits` was frozen at creation

A product vanished from the investor listing after a price update, while customers and admin still
saw it. The pricing was fine — a read-only check showed `price 90 / vendorPrice 75 / investorPrice 75
/ investorPayout 90` at a 20% margin, exactly right. The real state was:

```
stock: 10    investableUnits: 3    investments: 3    → remaining 0
```

A pre-save hook set `investableUnits = stock` on creation and never touched it again, so restocking
from 3 to 10 left the cap at 3. Once 3 units were funded the product reported 0 remaining, and the
investor listing hides those by default ("Available now"). Customer and admin pages don't filter on
it, hence the asymmetry. The same staleness was the "2/3 units" readout that ignored a restock.

**Fix:** `investableUnits` is now nullable, meaning "follow stock" — every read already resolved it
as `investableUnits ?? stock`, so deleting the hook was the whole change. Superadmin can still enter
a number to cap it lower, and clearing the field now sets it back to null (it previously ignored an
empty value, so a cap could be raised but never removed).

`scripts/unfreezeInvestableUnits.js` clears the frozen values on existing products. It skips caps
that look deliberate (a cap that isn't simply equal to stock) unless given `--all`, and has a
`--dry-run`. Run against the test data it freed 4 products and correctly left one alone whose cap of
500 against stock 5 was clearly hand-set.

### 2: vendor form claimed "You receive ₹120.00 … platform margin ₹0.00"

The readout fell back to a 0% margin whenever the settings fetch didn't resolve, so it told vendors
they'd receive the full listing price. Removed at the user's request, along with the
`usePricingSettings` call behind it. Vendor read access to `/admin/pricing-settings` — added only to
support this readout — was reverted to admin/superadmin, rather than left widened for nothing.

### 3: out-of-stock states

`stock <= 0` now shows an "Out of stock" overlay on the card for both customers and investors.
Crucially the investor side distinguishes two situations that previously shared the "Fully funded"
label: **out of stock** (the vendor has nothing to fund — needs a restock) versus **fully funded**
(stock exists but every unit is already taken). The quantity stepper and invest button are disabled
in both cases. A product with no `stock` field at all is never treated as out of stock.

---

## Phase 15 — Vendors get the full product form

The vendor form was a deliberately minimal 255-line form (name, description, category, stock, price,
images) while admin had a 1519-line one. Vendors now get the same form.

**It is the same component, not a copy.** `SimpleProductForm` took no props; it now takes `role`,
`mode`, `initialProduct` and `editProductId`, all optional and all defaulting to the previous
admin-create behaviour, so the admin route is untouched. `VendorProductForm` is a 10-line wrapper
that renders it with `role="vendor"`. A second 1500-line form would have drifted within a release.

Vendors now have: drag-and-drop images with a featured picker, category/brand/sub-brand,
productId/material/finish/colour/size, specifications, variants, six highlights, care instructions,
tags, and the live preview card.

### Three things vendors deliberately don't get

Each because the backend would reject or mis-handle it, not as an arbitrary limit:

- **MRP (`cuttedPrice`)** — it's in `SUPERADMIN_ONLY_FIELDS` and gets stripped, so showing the field
  would only mislead. Omitted from the payload too, and the MRP > price validation is skipped.
- **Per-variant pricing** — checkout charges `variant.price` while settlement still pays the
  investor `product.price`, so a per-variant price breaks the margin math (Phase 10 known gaps).
  Vendor variants are catalogue-only and inherit the product price, which `getPriceForSize` already
  falls back to. Enforced server-side as well: `stripSuperadminOnlyFields` only reaches top-level
  keys, so `createProduct`/`updateProduct` now delete `price`/`cuttedPrice` from each variant on
  vendor requests.
- **Publishing** — unchanged, a vendor listing still goes to `pending_approval`.

### Bug found while wiring edit mode

`updateProduct` appended new images only when the uploaded array was non-empty, but left the empty
array in `req.body` otherwise — so `findByIdAndUpdate` **wiped every existing image** on any edit
that didn't add one. Harmless before (the old minimal form only sent `images` when files were
picked) and guaranteed to fire with the new form, which always sends the array. The key is now
deleted when empty.

Edit mode also shows the product's current images above the uploader, since the endpoint appends
rather than replaces.

### Checks

Rendered all three configurations and asserted on the server HTML: vendor-create has "Listing Price"
and no MRP, admin-create is unchanged with MRP and "Create Product", and vendor-edit hydrates name,
description, productId, price, stock, material, finish, highlights, specifications, care
instructions, variants, pre-checked tags and the existing-images strip. `react/no-unescaped-entities`
count is identical before and after (12), confirming no new lint debt.

---

## Phase 16 — Margin categories with admin-set, per-category sell-speed windows

**Built 2026-10-19.** Confirmed with user the same day (`changes.txt` item 2; item 3 fell out of
the same change, as predicted below).

The tier the user asked for is **not a new subsystem** — it already existed as `liquidity`
(`fast/steady/slow`) with `<= 30` and `<= 90` hardcoded in `classify()`. This phase moved those two
numbers onto the product category, let admin edit them, and renamed the three real tiers.

### Two different things are both called "category"

This is the naming the app now commits to, because the user raised it explicitly:

1. **Product category** — the existing 3-level taxonomy in `categoryModel.js`: Electronics,
   Fashion, Kitchen, Health and their sub-levels. Admin-managed, unchanged.
2. **Margin category** — the tier a product falls into based on how fast it sells: **high margin /
   medium margin / low margin**. Derived, never typed in.

The link between them is the only new stored data in this phase: **each product category carries its
own three day-windows**, and those windows decide which margin category its products land in.

| Product category | High margin | Medium margin | Low margin |
|---|---|---|---|
| Electronics | 15 days | 30 days | 90 days |
| Fashion | 5 days | 20 days | 90 days |

Fully admin-controlled — the 24h / 30d / 3mo figures from the original brief survive only as the
seeded global default, not as code.

### The tier already exists, with the thresholds hardcoded

`lib/investor/metrics.ts` has `classify(estDaysToSale, hasEverSold)` returning
`fast | steady | slow | stalled | untested`, and the boundaries are literally `<= 30` and `<= 90`
written into the function. The investor browse page already filters and counts on it, and
`LiquidityBadge` already renders it.

So Phase 16 is **not a new subsystem**. It is: move those two numbers out of the function and onto
the product category, let admin edit them, and rename the three real tiers to the margin names the
user asked for. A stored `marginTier` field plus a nightly recompute job would be the same
information, only staler.

Renaming `fast/steady/slow` → `high/medium/low` also delivers `changes.txt` item 3 almost for free:
the investor earnings page gets the margin-category filter because the tier is now a real labelled
dimension instead of a hint about liquidity.

### Decisions this locks in

- **Measured time is velocity-based, not a stopwatch from publish.** A product with stock sells
  continuously, so "how fast it sold" has to be a rate. Tier input is **`7 / velocityPerWeek`** —
  days for *this product* to sell one unit — using the velocity `metrics.ts` already computes
  (recent 4 weeks, falling back to the full 12).
- **The tier deliberately excludes `queueAhead`.** `estDaysToSale` is `(queueAhead + 1) / velocity`
  and is specific to one investor's position in the FIFO queue. If the tier used that, the same
  product would be "high margin" to one investor and "low margin" to another, and admin would see a
  third answer. The margin category is a property of the product, so it uses the product figure;
  `estDaysToSale` stays exactly as it is for the investor's own wait estimate.
- **Never sold → `untested`, not "low margin".** Already how `classify` behaves; a listing with no
  sales data is unknown, not bad. **Used to sell, now quiet → `stalled`.** Both tiers are kept.
- **Recomputed on every read.** Free, because nothing is stored.
- **Thresholds set at any category level, inherited from the nearest ancestor that has them.** Null
  means inherit. Nothing set anywhere up the chain → the global default in `platformSettings`.
  Setting windows on all 3 levels of every category would be busywork for a taxonomy where
  Electronics → Audio → Headphones all turn over at roughly the same speed.
- **Visible to admin and investor.** Vendor and customer unchanged this phase.

### Backend

- `models/categoryModel.js` — new `marginTierDays: { high, medium, low }`, each a nullable Number,
  `min: 1`. A `pre('validate')` guard rejects anything but `high < medium < low`: out of order, one
  tier becomes unreachable and products silently misclassify, which is exactly the kind of admin
  typo that surfaces three weeks later as "why is nothing ever medium margin".
- **`utils/marginTiers.js`** (new) — owns the default windows, the validation rule and the
  inheritance resolver. `DEFAULT_MARGIN_TIER_DAYS = { high: 1, medium: 30, low: 90 }` (the brief's
  24h / 30d / 3mo) lives here as a constant, **not** as a `platformSettings` field: the plan said DB,
  but every product payload already carries its resolved windows, so a settings row would have added
  a migration and an admin screen for a number nothing else reads. Add the field if admin ever needs
  to retune the fallback without touching each category.
- `makeMarginTierResolver(byId)` is pure and synchronous over an already-loaded map, with
  `buildMarginTierResolver()` as the one-query wrapper — that split is what makes the inheritance
  chain checkable with no database.
- `controllers/categoryController.js` — accept the three fields on create/update, superadmin-only
  like the rest of the pricing controls. Plus `resolveMarginTierDays(category)`, which walks
  `parent` upward for the nearest non-null trio and falls back to the singleton.
- `controllers/productController.js` — `getInvestorProducts` resolves the trio alongside its existing
  aggregations (third entry in the same `Promise.all`) and attaches it per product, from
  `subcategory || category` so the most specific listing level wins. Admin's product list is
  deliberately untouched: it carries no sales aggregation, and duplicating that query to render a
  badge wasn't worth it — admin gets the windows themselves on the categories screen.
- `routes/categoryRoute.js` — unchanged. The windows ride the existing admin/superadmin-gated
  category routes, matching "fully controlled by admin" rather than superadmin-only.

### Frontend

- `lib/investor/metrics.ts` — `classify` takes the resolved thresholds. `Liquidity` →
  `MarginTier` (`high | medium | low | stalled | untested`), `LIQUIDITY_META` →
  `MARGIN_TIER_META`. New `daysToSellOneUnit` (`7 / velocityPerWeek`) is what the tier classifies
  from. Hints are now **generated** by `marginTierHint(tier, days)` — "Est. under 30 days to sell"
  became a lie the moment Fashion set its high window to 5 days. `MARGIN_TIER_META` also carries a
  `blurb`, the category-relative wording for lists that span many categories at once (the filter
  sidebar) and so can't quote one category's day counts.
- `MARGIN_TIER_ORDER` replaced three separately-maintained copies of the same 5-element tier
  order (filter sidebar, portfolio buckets, earnings dropdown).
- `lib/investor/earnings.ts` keeps a **type-only** import from `./metrics` — a runtime import breaks
  `node --experimental-strip-types` on its self-check, so the dropdown options are assembled in the
  page from `MARGIN_TIER_ORDER` + `MARGIN_TIER_META` instead.
- `lib/investor/portfolio.ts` — `Position` gains optional `marginTier`/`marginTierDays`. Not
  derivable from investment rows (they carry no velocity), so the page attaches them.
- `components/admin/settings/CategoryManagement.tsx` — three day inputs in the create/edit modal,
  with the **inherited** values as placeholders and the source named ("leave blank to use
  Electronics' windows"), so a blank field shows what it will actually do. Every tree row carries a
  `15/30/90d` chip, amber when the category sets its own and grey + "inherited" when it doesn't, so
  which categories have been tuned is visible without opening anything. The client repeats the
  all-or-nothing + ascending rule to disable the submit button, as feedback only — the API check is
  the one that counts.
- `app/investor/products/page.tsx` — filter chips and the `fastCount` headline follow the rename;
  the filter logic itself already keys off `item.liquidity` and needs no change.
- `app/investor/earnings/page.tsx` — new margin-category dropdown (`changes.txt` item 3), plus the
  badge under each product name rather than an eighth table column. Reuses the investable-products
  query (already cached by the browse page) purely to read each product's tier, the same trick
  `app/investor/page.tsx` already uses for `PortfolioLiquidity`.
- `components/investor/InvestorCharts.tsx` — `LiquidityBadge` → `MarginTierBadge`, now taking the
  product's windows so its tooltip quotes real numbers. Tone mapping unchanged (good/warning/serious
  maps cleanly onto high/medium/low).
- `components/investor/PortfolioLiquidity.tsx`, `components/products/ProductItem.tsx`,
  `components/investor/InvestorFilterSidebar.tsx` — carried the rename; the sidebar's filter logic
  already keyed off the tier and needed no new code. The browse page's "Fast Moving" stat tile is
  now "High Margin".

### Checks

All green:

- `node utils/marginTiers.test.js` (new) — the inheritance chain (level 2 → level 1 → level 0 →
  default), own windows beating an ancestor's, dangling/absent category references, populated docs
  vs bare ids, memoisation not leaking one branch's answer into a sibling, a corrupted parent cycle
  falling back instead of looping, and every rejection the validator owes (half-filled, equal,
  descending, zero, non-numeric).
- `node --experimental-strip-types src/lib/investor/metrics.check.ts` — boundaries are inclusive
  (exactly 15 days is high, 16 is medium, exactly 30 is medium, 31 is low, 400 stays low); the same
  12-day sell speed is **high** under Electronics' windows and **medium** under Fashion's; a 20-deep
  queue moves `estDaysToSale` from 7 to 140 days and leaves the tier at high; zero velocity still
  splits `stalled` from `untested`; a payload with no windows falls back instead of classifying on
  NaN; hints are generated from the windows, singular "1 day" included.
- `node --experimental-strip-types src/lib/investor/earnings.check.ts` — the tier filter, a
  delisted position with no tier reading as `untested` rather than vanishing from an unfiltered
  view, and composition with the return band.
- `npx tsc --noEmit` clean, `npm run build` succeeds, and no new lint findings (the rewritten
  boundary block replaced the old queue-driven one, which had been asserting exactly the coupling
  this phase removes).

### Deliberately skipped

- **A stored tier + cron recompute** — derived is free and never stale. Add only if the tier ever
  needs to be queried/sorted server-side at a scale the client can't handle.
- **A per-tier margin %** — i.e. "high margin products get a 30% cut". The tier is a label and a
  filter this phase; pricing still comes from the global margin plus the Phase 12 per-product
  override. This is the one extension most likely to be wanted next.
- **A `platformSettings.marginTierDays` row** — see the backend note above.
- **The tier on admin's product list** — would mean duplicating the investor sales aggregation.
- **A 4th tier.** Three, as specified.

---

## Phase 17 — A margin % per margin category, per product category

**Built 2026-10-20.** Requested the same day: the Phase 16 modal only took days, and admin also
needs to set the **margin percentage** for each of high / medium / low, per product category. This
is the extension Phase 16 listed as "most likely to be wanted next".

Two decisions confirmed with the user 2026-10-20, both recorded below: repricing happens **only
when admin acts**, and a category's tier % **beats** the Phase 12 per-product override.

So each product category carries six numbers, not three:

| Electronics | window | margin % |
|---|---|---|
| High margin | 15 days | 30% |
| Medium margin | 30 days | 20% |
| Low margin | 90 days | 12% |

### What makes this different from Phase 16

Phase 16 was a label. This is the platform's cut, and under the Phase 10 formula that single number
decides three things at once:

```
vendorPrice    = price / (1 + marginPct/100)   what the vendor is paid
investorPrice  = same                          what an investor pays
investorPayout = price                         what an investor is paid
```

So **the margin % IS the investor's return and the vendor's deduction.** Raising a product's margin
cuts the vendor's net and makes every unmatched investor on that product over-invested, which owes
them a refund (`utils/repriceInvestments.js`, and the Phase 14 note that it's *raising* the margin
that triggers refunds, not lowering it).

### Decision 1 — controlled repricing, never silent drift (confirmed)

A product's tier is derived from live sales velocity, so it **drifts on its own**. If the margin
followed the tier automatically, a product sliding from high to medium would quietly re-price
itself, pay its vendor differently, and issue investor refunds with nobody having touched anything.

So the tier stays derived and always displays live, but money only moves at an explicit moment:

- a product is created or edited,
- the per-product pricing panel is saved,
- the global margin is changed (the existing recalculate loop),
- **a category's tier percentages are saved** — repricing its own products and those of every
  descendant category that inherits from it,
- **admin presses a new "Apply margin categories" button**, which re-classifies every product and
  reprices only the ones whose tier margin has actually moved, reporting how many were repriced and
  how many investors were refunded before doing it.

Deliberately NOT a cron job. Velocity moves daily; an automatic nightly pass would fire real
Razorpay refunds on a schedule nobody is watching.

### Decision 2 — resolution chain: the category tier % wins (confirmed)

Three sources, in this order — each step `??` rather than `||`, so an explicit **0%** anywhere is
honoured instead of falling through:

1. **the % for the product's current margin tier**, from its category (inherited up the tree the
   same way the windows are). This is the authority: a category's rules are not overridable
   product by product.
2. `product.marginPct` — the Phase 12 per-product override. Now a **fallback**, not an override:
   it applies only to products whose category chain sets no percentages, or whose tier is
   `untested`/`stalled` (see below).
3. `settings.marginPct` — the global rate, when neither of the above applies.

**The tier % can only apply when there IS a tier.** `untested` (never sold) and `stalled` (nothing
in 12 weeks) have no sell speed to classify, so they fall through to the override and then the
global rate — a brand-new listing must not be priced off a velocity that doesn't exist yet.

This inverts Phase 12's intent, so the UI has to say so plainly: `ProductPricingPanel` must show
that an override is **being ignored** while the product's category sets a tier %, otherwise an
admin types 35% into a field that silently does nothing. Phase 12's own section should get a
pointer to this one.

### Backend

- `models/categoryModel.js` — `marginTierPct: { high, medium, low }`, nullable, 0–100. Same
  all-or-nothing rule as the windows. **No ordering constraint**: unlike the day windows, a flat or
  inverted set is a legitimate business choice (paying more on slow movers to shift them).
- `utils/marginTiers.js` — `tierPctError()` validation, the resolver generalised to resolve both
  trios, and `classifyMarginTier(daysToSellOneUnit, hasEverSold, windows)`: an exact mirror of
  `classify()` in `lib/investor/metrics.ts`, because classification now has to happen server-side
  to price anything.
- `utils/salesVelocity.js` **(new)** — the weekly-sales aggregation that was inline in
  `getInvestorProducts`, extracted so one query serves both the investor listing and the pricing
  path. `SALES_WINDOW_WEEKS` / `RECENT_WEEKS` moved here with it. Its `hasEverSold` sees only
  orders, so the backend can call `stalled` what the client (which also sees investment history)
  calls `untested` — the two differ only in the label, never the price, since neither tier carries
  a margin %.
- `utils/effectiveMargin.js` **(new)** — the one place that answers "what margin applies to this
  product". Four callers depend on that answer agreeing: pricing on save, both bulk recalculate
  loops, the investor listing, and the admin/vendor payloads that print "you receive ₹X". It also
  returns `marginSource` (`category` / `product` / `global`), which the UI needs now that a tier
  silently outranks an override.
- `utils/pricingCalculator.js` — `resolveMarginPct(product, settings, tierPct)` takes the tier
  margin as an optional third argument, and prefers it over `product.marginPct` per decision 2.
  Every existing caller keeps working unchanged (no third argument = no tier, old behaviour).
- `utils/repriceProducts.js` **(new)** — the recalculate-and-refund loop lifted out of
  `settingsController.updatePricingSettings`, which would otherwise be copied a third time for the
  category save and the apply button. Returns `{ updated, refunded, overridden }`.
- `controllers/categoryController.js` — accepts and validates the percentages; saving them reprices
  the affected products.
- `controllers/productController.js` — `applyListingPrice` resolves the tier margin; the investor
  payload keeps its windows; new `applyMarginCategories` endpoint behind the apply button.

### Frontend

- `CategoryManagement.tsx` — a `%` input beside each day input, so a row reads
  "High margin: [15] days → [30] %". Row chip becomes `15/30/90d · 30/20/12%`.
- `ProductPricingPanel.tsx` — must show the effective margin **and where it came from** (category
  tier / override / global), and explicitly flag an override that is currently being **overruled**
  by a tier %. Today it says "the global 20%"; once a tier outranks both that and the override, an
  unlabelled 20% is a lie that costs the vendor money.
- `SimpleProductForm.tsx` — the vendor's "you receive ₹X" readout derives from the global margin.
  Correct for a new listing (untested → global), wrong when editing a classified product, so the
  product payload needs an `effectiveMarginPct` for the form to read.
- `GlobalPricingBar.tsx` — caption notes that categories can override the global rate.
- A confirmation before any save that reprices, matching the existing margin-bar pattern: it must
  say how many products and how many investor refunds are about to be affected.

### Checks

All green, plus `npx tsc --noEmit` clean, `npm run build` successful, and no new lint findings:

- `node utils/pricingCalculator.js` — the three-level precedence with the tier on top, explicit
  `0%` honoured at each level (including a 0% tier beating a 35% override, and a 0% override still
  losing to a tier), a tier margin pricing identically to the same number as an override, and a
  product override honoured again once the tier goes away.
- `node utils/marginTiers.test.js` — percentage validation (all-or-nothing, 0–100, **flat and
  inverted sets allowed**), both trios resolving **independently** up the same chain (`fashion`
  sets windows and inherits no percentages; `flatpct` sets percentages and takes the default
  windows), memoisation not leaking one branch's answer into a sibling, and `marginPctForTier`
  returning null for `untested`/`stalled` even when the category has percentages — while a real
  0% tier stays 0 rather than reading as "unset".
- The same file carries the **parity check**: `classifyMarginTier` asserts the identical inclusive
  boundaries (14/15/16, 30/31, 400) and the same-speed-different-windows case that
  `metrics.check.ts` asserts for `classify()`. Two implementations of one rule is exactly where a
  silent money bug would live.
- `node utils/repriceProducts.test.js` **(new)** — a moved margin is written and settles its
  investors; an unmoved one under `onlyChanged` is neither written nor settled (no spurious
  refund); the global-margin path still visits every product unconditionally, which is what keeps
  a `vendorPrice` from going stale; a never-priced product isn't mistaken for unchanged; and a
  `pending_approval` listing is **not** published by a repricing pass.
- Products are plain objects with a `save()` stub and the investor settlement is injected
  (`settleInvestments`), which is the one DI seam added in this phase — justified by it being the
  money path, and the only way to check the loop without a live database and Razorpay.

### Two bugs this phase had to fix on the way

1. **`updateProductPricing` watched the wrong number.** It refunded investors only when
   `product.price` changed. Phase 17 makes the margin movable without the price moving at all (the
   product's margin CATEGORY changed), which shifts `investorPrice` while `price` stays put — so
   the guard would have skipped refunds that were genuinely owed. It now compares `investorPrice`
   before and after, which is the figure investors are actually repriced against.
2. **Saving percentages had to move money immediately.** Without repricing on category save, admin
   would type 30% and watch nothing happen. `updateCategory` now reprices its own products and
   every descendant category's (they inherit), but only when the percentages really changed —
   compared against what's stored, before the write.

### Open consequence, not resolved by this phase

A vendor's net now moves when their product's sell speed changes category, which they currently get
no notification of. The vendor product form at least no longer *lies* about it — it reads
`effectiveMarginPct` off the product instead of the global rate — but a vendor is never told the
change happened. Worth a line on the vendor income screen eventually; flagged, not built.

---

## Phase 18 — The superadmin role is gone; admin is the app owner

**Built 2026-10-26.** Requested while trying to set a per-product margin and finding no UI: *"there
is only four roles customer, admin, investor, vendor and this full control should be to admin"*.

A fifth role, `superadmin`, had accumulated across earlier phases as the holder of every money
control. The effect in practice was that the app owner, logged in as `admin`, was locked out of
their own margin settings — and out of three whole pages, which simply did not appear in the
sidebar. 138 references across 38 files.

### What `admin` could not reach before this

| Locked behind superadmin | Where |
|---|---|
| Vendors, Investors, Reports pages | `Sidebar.tsx` `superadminOnly` + each page's `RoleGuard` |
| Global margin / GST bar | `admin/products/page.tsx` |
| Per-product pricing panel | `admin/products/[id]/edit/page.tsx` |
| "Apply margin categories" | `admin/categories/page.tsx` |
| Save product pricing, apply margin categories, transactions summary, all payments, approve onboarding | 5 `authorizeRoles("superadmin")` routes |

Everything else already accepted `admin` alongside it, so the role was never a security boundary —
just a second admin tier nobody had an account for.

### Removed, not aliased

`admin` could have been added to every superadmin gate, leaving the role as a dead synonym. It was
deleted from the enum instead, because a role that still exists is a role someone re-gates against
later.

- `models/userModel.js` — enum down to `['user', 'vendor', 'investor', 'admin']`, with a comment
  recording why there is no tier above `admin`.
- All route files — `authorizeRoles('admin', 'superadmin')` → `authorizeRoles('admin')`, and the 5
  superadmin-only routes likewise. `getPricingSettings` keeps `vendor` (they need the margin to show
  their own net).
- `productController.js` — `isOwnerOrAdmin` checks one role; `SUPERADMIN_ONLY_FIELDS` /
  `stripSuperadminOnlyFields` → `ADMIN_ONLY_FIELDS` / `stripAdminOnlyFields`.
- `Sidebar.tsx` — `superadminOnly` and the whole session lookup deleted; all 11 items always render.
- The four `RoleGuard`s, `RoleGuard.tsx`'s `Role` union, and the `isSuperadmin` checks in the
  products list, categories page and product edit page.
- `ProductPricingPanel.tsx` — heading **"Superadmin Pricing" → "Admin Pricing"**, as asked.

### The product edit page collapsed, it didn't just widen

That page had two modes: a superadmin edited price/MRP only through the Pricing panel, while a
plain admin edited them inline on the form. With one admin role left, the inline inputs are now
**always** disabled with "Set via the Pricing panel above", and the form never submits
`price`/`cuttedPrice` — which is the behaviour that cannot silently clobber pricing with a stale
form value. The panel renders unconditionally.

### The ledger rows had the role's name in their data

`transactionModel.js` stored `superadmin_profit` / `superadmin_reversal` as `type` enum **values**,
and `reportController` switched on those strings. Renamed to `platform_profit` /
`platform_reversal` (which is what the reports UI already called them — the labels read "Platform
Profit" before this phase). The summary key `superadminProfit` → `platformProfit` across the
controller and `useTransactionsSummary`.

**`scripts/removeSuperadmin.js` (new) must be run against each database**, and both halves of it
fail quietly rather than loudly if it is not:

- a user still on `role: 'superadmin'` is no longer in the enum, so every route check rejects them —
  the owner is locked out of the panel this phase was meant to open;
- transaction rows still on the old `type` no longer match `reportController`'s switch, so the
  reports page **under-reports platform profit** instead of erroring.

It uses `updateMany`, not `save()`: the old role is already out of the enum, so a document
validation pass would reject the very rows being fixed. Idempotent, and it prints the email of
every account it promotes.

### Checks

- `npx tsc --noEmit` clean; `npm run build` compiles.
- `node --check` on every edited backend file.
- `utils/marginTiers.test.js`, `utils/pricingCalculator.js`, `utils/repriceProducts.test.js` all
  pass — the role change touches no pricing maths.

### Deliberately skipped

- **Renaming `'user'` → `'customer'`.** The fourth role is spelled `user` in the enum and the user
  called it "customer". Pure cosmetics on a value stored on every account; not asked for.
- **Removing the now-redundant inner `RoleGuard`s** on the Vendors/Investors/Reports pages — the
  admin layout already guards them, but a correct redundant guard is cheaper to keep than a JSX
  rewrite to delete.
- **Rewriting the superadmin mentions in Phases 1–17 of this document.** They describe what was
  true when each phase shipped.

---

## Phase 19 — The margin category measures time-to-first-sale, not sales velocity

**Planned 2026-10-26. Not built — awaiting go.** Depends on Phase 18 (the admin can now reach
the pricing panel at all). Phase 16 answered `changes.txt` item 2 with the
wrong clock. The brief says "**after uploading** based on how fast that product got sold"; Phase 16
built a rolling sales **rate** instead and recorded the swap as a decision
(`salesVelocity.js` → `daysToSellOneUnit = 7 / velocityPerWeek`, plan line 737: *"Measured time is
velocity-based, not a stopwatch from publish"*). That decision is reversed here.

### Why the current clock is wrong, concretely

- **A product that genuinely sells within 24h is classified `medium`.** One unit sold the day it
  was listed → 1 unit over the recent 4 weeks → `0.25/week` → `7 / 0.25 = 28 days` → medium under
  the default `{1, 30, 90}`. Reaching `high` needs **28 units in 4 weeks**, so under the brief's own
  24h window the high tier is effectively unreachable.
- **Tiers decay after the sale already happened.** That same product falls to `low` once the 4-week
  recent window empties (12-week rate → 84 days), then to `stalled` at 12 weeks. It sold in 24
  hours and ends up stalled.
- **"After uploading" never enters the calculation.** `createdAt` is not read, there is no
  `firstSoldAt`, and nothing counts lifetime units — `orderController.js` only decrements stock.

Phase 17 turns the tier into the vendor's deduction and the investor's return, so this is
mispricing, not a wrong badge.

### The rule, as confirmed with the user 2026-10-26

```
tier = product.marginTierOverride                                  ← admin forced it outright
       ?? (firstSoldAt ? classify(firstSoldAt − liveAt, windows)   ← measured, then frozen forever
                       : 'low')                                    ← unsold ⇒ low, always

windows = product.marginTierDays        ← NEW: per-product trio
          ?? nearest ancestor category's trio   ← existing Phase 16 chain, unchanged
          ?? { high: 1, medium: 30, low: 90 }
```

Four decisions this locks in:

- **Measured once, then frozen.** Sold 18h after listing ⇒ high margin, permanently, whatever it
  does later. That is what "how fast that product got sold" means. A product cannot be re-measured,
  because it only has one first sale.
- **Unsold ⇒ `low`.** The user's words: *"if a product is listed and admin didn't mention which
  margin and what days then it will be in low by default."* Low is the floor, and selling fast
  **promotes** off it. This answers "4 months unsold = low" without a running clock, and — unlike a
  provisional tier that starts at `high` — nothing is ever priced at the top cut on zero evidence.
- **`stalled` and `untested` are deleted.** Both existed only because the velocity window could
  empty. With a frozen stopwatch and a `low` floor, every live product has exactly one of the three
  real tiers. Removes two entries from `MARGIN_TIER_ORDER`, the filter sidebars, the portfolio
  buckets and the earnings dropdown.
- **The clock starts at go-live, not `createdAt`.** Vendor listings start `draft` and can sit in
  `pending_approval` for days; billing a product for admin's approval delay would push genuinely
  fast sellers into medium. Hence a stamped `liveAt`.
- **Admin can override either number per product** — the tier itself, or that product's three
  windows. Requested in the same breath as the clock fix. Admin-only, like the Phase 12
  `marginPct` override it sits next to. So three per-product knobs in one panel: the **%**
  (`marginPct`, Phase 12), the **tier** (`marginTierOverride`), and the **windows**
  (`marginTierDays`).
- **The Phase 17 precedence is reversed: a per-product margin % now BEATS the category's tier %.**
  Confirmed 2026-10-26. `resolveMarginPct` becomes
  `product.marginPct ?? tierPct ?? settings.marginPct`. This is forced by deleting
  `untested`/`stalled`: those were the only tiers returning a null `tierPct`, and that null was the
  only gap through which a per-product override ever reached the price. Leave the Phase 17 order in
  place and `product.marginPct` becomes dead code for every product whose category has percentages
  — admin types 25% and watches nothing happen. An explicitly typed per-product number is also the
  most specific instruction admin can give, so it outranking a category default is the order that
  matches how the rest of the chain already reads.
- **Repricing still only when admin acts** (Phase 17 rule, unchanged). The fix re-tiers most of the
  catalogue, so prices move on an explicit "Apply margin categories", never on deploy.

### Falls out for free

Classification stops needing the 12-week order aggregation — it is now two date fields on the
product document. `salesVelocity.js` **stays**, but only serves the investor sparkline and
`estDaysToSale` (one investor's FIFO queue wait, a genuinely different number that Phase 16 was
right to keep separate). Two consequences: the pricing path loses a database aggregation, and
**admin's product list can finally show the tier** — Phase 16 skipped that column purely because
rendering it meant duplicating the investor aggregation.

### Backend

- `models/productModel.js` — `firstSoldAt: Date|null`, `liveAt: Date|null`,
  `marginTierDays: {high, medium, low}` (nullable trio, same all-or-nothing/ascending rule as the
  category's), `marginTierOverride: enum('high','medium','low', null)`.
- `controllers/orderController.js` — stamp `firstSoldAt` on the first unit sold, beside the existing
  `product.stock -= quantity`. Write-once: `if (!product.firstSoldAt)`.
- Wherever `listingStatus` first becomes `live` (product create for admin, approval for
  vendor listings) — stamp `liveAt` once.
- `scripts/backfillMarginClock.js` **(new)** — derive `firstSoldAt` for existing products from the
  earliest non-cancelled order containing each, and `liveAt` from `createdAt` for anything already
  live. Without it every existing product reads as unsold ⇒ low.
- `utils/marginTiers.js` — `classifyMarginTier(daysToFirstSale, windows)` loses its `hasEverSold`
  argument and its two non-tiers; `marginPctForTier` loses the null-for-stalled/untested case. The
  windows resolver gains a product level above the category chain.
- `utils/effectiveMargin.js` — resolve the tier from the product's own dates plus the override;
  drop `getSalesVelocity` from the pricing path. `marginSource` keeps naming where the number came
  from, with `product` now able to win — the panel reads it to label the figure.
- `utils/pricingCalculator.js:36` — `resolveMarginPct` order flipped to
  `product.marginPct ?? tierPct ?? settings.marginPct`. **This moves money**: any product that has
  both an override and a category tier % reprices, and its investors settle. Covered by the
  existing "only when admin acts" guards (`repriceProducts` with `onlyChanged`, and the
  `investorPrice`-before/after comparison in `updateProductPricing`), but it is the one change in
  this phase that reprices products whose tier did not change.
- `controllers/productController.js` — accept the two new fields on create/update, admin-only;
  attach the resolved tier to the admin product list payload.

### Frontend

- `lib/investor/metrics.ts` — `classify` takes days-to-first-sale; `daysToSellOneUnit` stops feeding
  the tier and keeps feeding `estDaysToSale` only. `marginTierHint` rewords to the stopwatch
  ("Sold 18h after listing" / "Not sold yet"). `MarginTier` drops to three values.
- `MARGIN_TIER_ORDER`, `InvestorFilterSidebar`, `PortfolioLiquidity`, `investor/earnings`,
  `investor/products`, `MarginTierBadge`, `ProductItem` — carry the 5-tier → 3-tier reduction.
- `components/admin/ProductPricingPanel.tsx` — the per-product tier override and per-product
  windows, next to the existing `marginPct` override, with the inherited values as placeholders and
  the source named (same pattern as `CategoryManagement.tsx`).
- `app/admin/products/page.tsx` — the tier column, now that it is free.

### Checks

- `utils/marginTiers.test.js` — rewritten boundaries: exactly 24h is high, 25h is medium, exactly
  30d is medium, 31d is low, unsold is low at any age, an override beating a measured tier, and the
  product trio beating its category's. The `classifyMarginTier` ↔ `classify()` parity assertions
  stay — two implementations of one money rule.
- `src/lib/investor/metrics.check.ts` — the same boundaries client-side, plus `estDaysToSale`
  provably unaffected by the tier change.
- One check asserting a frozen tier: a product sold at 18h stays `high` after its velocity goes to
  zero. That is the exact regression Phase 16 shipped.
- `utils/pricingCalculator.js` self-check — the precedence assertions **invert**. Phase 17 asserted
  a 0% tier beating a 35% override and a 0% override still losing to a tier; both now resolve the
  other way. Explicit `0%` must still be honoured at each level rather than reading as "unset",
  which is the half of those tests that does not change.

### Deliberately skipped

- **A stored `marginTier` field.** Still derived — it is now cheaper to derive than before.
- **Re-measuring on restock.** A product has one first sale; per-unit wait times would mean
  tracking an availability clock per unit, and admin's per-product override covers the case where
  the single measurement is unfair.
- **Notifying vendors when their tier (and so their net) changes.** Still open from Phase 17; a
  frozen tier makes it rarer, not gone.

## Phase 20 — Margin bands are per-product, admin-set at approval, and paid per investment

**BUILT 2026-10-26/28.** Backend and frontend both shipped; all five self-checks pass, `tsc` is
clean, `next build` compiles. Supersedes Phases 16 and 17 outright and replaces the unbuilt
Phase 19. Confirmed with the user 2026-10-26.

### Status — what actually shipped

Everything in the Backend/Frontend/Checks sections below is done, with three deviations from the
plan as written:

- **`utils/repriceProducts.js` was inlined, not deleted.** The plan said delete it; two of its three
  callers went away, but the global-margin save genuinely still needs that loop — changing
  `marginPct` really does move `vendorPrice`/`investorPrice` and really does owe refunds. It now
  lives as `repriceAll()` inside `controllers/settingsController.js`, with the tier /
  `onlyChanged` / `bySource` machinery stripped.
- **`PUT /admin/default-margin-bands` was added** (not in the original plan), with
  `settings.defaultMarginBands` and a matching editor in `components/admin/GlobalPricingBar.tsx`.
  Needed because Q4 was answered "global defaults, never block approval" — without an endpoint the
  defaults were unreachable. Saving it deliberately reprices nothing.
- **`MARGIN_TIER_*` export names were kept** (`MARGIN_TIER_META`, `MARGIN_TIER_ORDER`,
  `MarginTierBadge`, `marginTierHint`, `filters.marginTiers`) rather than renamed to
  `MARGIN_BAND_*`. Renaming touches ~8 more files for zero behaviour change. Cosmetic debt.

Also fixed in passing, both of which were actively wrong on screen rather than merely stale:

- The **vendor product form** told vendors "Invests ₹100 → receives ₹120 (₹20 profit, 20%)" — the
  pre-Phase-20 deal, and not the vendor's business either way. Removed, along with
  `investorReceives`/`investorProfit` from `vendorPriceBreakdown` in `src/lib/pricing.ts`.
- **`GlobalPricingBar`** claimed "an investor funding a unit always earns exactly this %" and "you
  earn ₹0 on a funded unit".

### OPEN DECISION — the one thing still unanswered

`labelFor()` in `utils/marginBands.js` lets the clock since go-live push an **unsold** product to a
slower band, never a faster one. Verified behaviour with the default bands and an admin pick of
`medium`:

```
live  0d ago -> medium      live 15d ago -> medium   (the medium window)
live 14d ago -> medium      live 16d ago -> high     (clock overtakes the pick)
```

The user asked whether their pick sticks; the honest answer is "for 15 days". They were offered the
alternative — **freeze the pick until the first real sale** — and have not yet chosen. It is a
one-line change in `labelFor`. Do not change it without asking.

### Live-data state as of 2026-10-28 (dev DB)

- **7 products are live and investor-visible, all with `liveAt: null` and `marginCategory: null`** —
  they predate this phase, so they never got a starting pick or a clock. Two of them
  (`ecommerse app`, `Test Invest Tile`) resolve to **high / 15%** purely as fallback, not by any
  decision. If that is unwanted, admin has to open each and set a band. Only products approved from
  now on get a `liveAt` stamp.
- **1 product sits in `pending_approval`** awaiting rules.
- Deliberately no backfill script for this — the Q4 answer (defaults apply) covers history too.

Two things change at once, and the second is the one that matters:

1. **Where the rules live.** Off the product taxonomy category, onto the individual product. iPhone
   15 and iPhone 14 are both phones and get different day counts and different percentages, so a
   trio set on Electronics was never the right grain. Admin sets a product's rules when they
   approve it out of the pending tab.
2. **What the percentage means.** It stops being the platform margin and becomes the investor's cut
   **out of** the platform margin. This is the correction Phase 17 needed: it conflated the two, so
   a 5% tier moved the customer's price.

### The money, restated

The platform margin (global 20%, or `product.marginPct`) sets the customer's price and the vendor's
net, exactly as Phase 10 has it, and is **untouched by the band**:

```
price (customer)  = P                      = 120
vendorPrice       = P / (1 + m/100)        = 100
investorPrice     = P / (1 + m/100)        = 100     investor fronts the vendor's cut
```

The band sets only what the investor is paid when their unit sells:

```
payout = amountInvested × (1 + bandPct/100)
```

| band | sells within | pct | investor pays → gets | platform keeps |
|---|---|---|---|---|
| low | 10 days | 5% | 100 → 105 | 15 |
| medium | 15 days | 10% | 100 → 110 | 10 |
| high | 90 days (and slower) | 15% | 100 → 115 | 5 |

So the platform keeps `margin − bandPct` on a funded unit instead of Phase 10's ₹0, and the full
margin on an unfunded one. `calculateUnitProfit` already computes this correctly once it is handed
the **actual** payout rather than the expected one.

**Naming note, because it inverts the existing code.** The label tracks the *percentage*, not the
speed: a fast sale earns the investor little (5% = **low** margin) because their capital came back
quickly, a slow one earns more (15% = **high** margin). Phase 16's `high` meant *fastest*, with
windows validated `high < medium < low`. Both numbers now ascend together —
`days: low < medium < high` and `pct: low < medium < high` — which is the invariant to validate:
**a longer wait must never pay less**.

### The rules, as confirmed

```
bandPct(investment) =
    investment.marginBands == null                  ← invested under the pre-Phase-20 deal
      ? (expectedPayout − amountInvested) / amountInvested × 100   ← honour it, untouched
      : bandFor(daysHeld, investment.marginBands)

daysHeld  = (matchedAt − createdAt) / 1 day         ← per investment, not per product
bandFor   = d ≤ bands.low.days    → bands.low.pct
            d ≤ bands.medium.days → bands.medium.pct
            otherwise             → bands.high.pct  ← open-ended, nothing slower to fall to

product.marginBands ?? settings.defaultMarginBands  ← snapshotted onto the investment at invest time
```

Six decisions this locks in:

- **Paid on each investment's own days held, not the product's label.** The Investment document
  already carries `createdAt` and `matchedAt`, so this needs no new clock. Your unit sold in 8 days
  pays 5%; another unit of the same product sold in 40 days pays 15%. Fairest reading of "if that
  product get sold in 10 days then 5% margin", and it means **no product is ever re-priced because
  its band moved** — which is what deletes `repriceProducts.js` and the whole "Apply margin
  categories" action.
- **The bands are snapshotted onto the Investment at invest time.** Two things fall out of one
  field. Admin editing a product's rules afterwards cannot retroactively change what an existing
  investor is owed; and `marginBands == null` is exactly "this investment predates Phase 20", so
  grandfathering the old full-listing-price deal needs **no migration script at all**.
- **The product's high/medium/low label decides nothing financial.** It is the forecast investors
  shop and filter by. Admin picks it at approval (`marginCategory`) on zero sales, as requested, and
  it moves afterwards on observed evidence:

  ```
  label = matchedCount > 0 ? bandFor(avg daysHeld of matched units, bands)
                           : max(admin's pick, bandFor(days since liveAt, bands))
  ```

  An unsold product's clock running past a threshold can only move it **up** (toward the higher
  percentage), never below admin's pick — a listing sitting four months unsold is a high-margin
  product by its own rules, and saying otherwise would be a lie the investor can check. Still
  derived, never stored. **Open for revision — see Questions below.**
- **Exactly one band at a time.** `bandFor` returns on the first threshold it meets, so the three
  are mutually exclusive by construction. There is no state in which a product is both.
- **Approval is not blocked when admin leaves the rules empty.** The panel shows the global
  defaults as the live fallback with the real numbers spelled out, so admin can see what the
  product will do before accepting it. Admin still reviews every product at approval — that is the
  flow — but the review can be "the defaults are right".
- **Band pct must be ≤ the product's platform margin %.** At 20% margin a 25% band would pay the
  investor more than the platform collected. Validated on save, with the product's effective margin
  named in the error.

### Backend

- `models/platformSettingsModel.js` — `defaultMarginBands: { low: {days, pct}, medium: …, high: … }`,
  defaulting to `{10d/5%, 15d/10%, 90d/15%}`. The fallback for products with no rules of their own.
- `models/productModel.js` — `marginBands` (nullable trio of `{days, pct}`; all six numbers or none,
  same all-or-nothing rule the category trios used), `marginCategory: enum('low','medium','high')|null`
  (admin's pick at approval), `liveAt: Date|null` (clock start for the unsold-label rule, stamped
  once when `listingStatus` first becomes `live` — not `createdAt`, since a listing can sit in
  `pending_approval` for days and billing a product for admin's delay would be wrong).
  `investorPayout` is **redefined**: the forecast under the product's current label, not the
  listing price. `marginPct` stays exactly as Phase 12 had it — the platform margin override.
- `models/investmentModel.js` — `marginBands` (the snapshot; null ⇒ legacy full-payout deal),
  `payoutPct: Number|null` and `payoutPaid: Number|null`, both filled at settlement so the earnings
  pages and any audit read one row instead of recomputing a money rule.
- `models/categoryModel.js` — **delete** `marginTierDays` and `marginTierPct`.
- `utils/marginTiers.js` → renamed `utils/marginBands.js`, and most of it **deleted**: the
  inheritance machinery (`makeTrioResolver`, `makeMarginTierResolver`, `buildMarginTierResolver`,
  the memo cache) has nothing left to walk. What survives is `bandFor(days, bands)`,
  `bandsError(bands, maxPct)` and `normaliseBands(bands)`. ~267 lines → ~80.
- `utils/pricingCalculator.js` — `resolveMarginPct(product, settings)` loses its `tierPct`
  argument and returns to the Phase 12 chain, `product.marginPct ?? settings.marginPct`. The
  Phase 17 precedence question disappears rather than being answered: the band is no longer a
  margin, so there is nothing for it to outrank. `calculateGlobalPricing` is unchanged except that
  `investorPayout` is no longer `price` — it is derived from the band, so it moves out of this
  function and into the band helper.
- `utils/effectiveMargin.js` — **delete**. It existed to thread the category chain and the sales
  velocity into pricing; pricing now needs neither, and its four callers go back to calling
  `resolveMarginPct` directly.
- `utils/repriceProducts.js`, `controllers/productController.js:applyMarginCategories`, the
  `repriceCategoryProducts`/`descendantCategoryIds` pair in `categoryController.js` — **all
  delete**. Nothing about a band moves a price any more, so there is no bulk re-apply to run and no
  refund it could trigger.
- `utils/repriceInvestments.js` — **keeps working, gets simpler.** A vendor price drop still
  refunds `amountInvested − investorPrice` and rewrites `amountInvested`; because the payout is now
  `amountInvested × (1 + pct)`, the payout self-adjusts and the line that copied
  `product.investorPayout` onto the investment goes away.
- `controllers/orderController.js` — settlement pays `bandPct(investment)` applied to
  `amountInvested` instead of `investment.expectedPayout`, stamps `payoutPct`/`payoutPaid`, and
  passes the actual payout to `calculateUnitProfit`. The legacy branch (null `marginBands`) pays
  `expectedPayout` unchanged.
- `controllers/investmentController.js` — snapshot `product.marginBands ?? settings.defaultMarginBands`
  onto each Investment at invest time, and set `expectedPayout` from the product's current label as
  a forecast.
- `controllers/productController.js` — accept `marginBands`/`marginCategory` on the approval and
  pricing endpoints (admin only, added to `ADMIN_ONLY_FIELDS`); stamp `liveAt` on the first
  transition to `live`; attach the resolved label + bands to the admin and investor payloads.
- `controllers/categoryController.js` — strip the trio validation, normalisation, change detection
  and reprice call out of create and update.
- `utils/salesVelocity.js` — **stays**, now serving only the investor sparkline and `estDaysToSale`
  (one investor's FIFO queue wait, a genuinely different number). The pricing path loses a database
  aggregation.

### Frontend

- `src/lib/investor/metrics.ts` — `classify` becomes `bandFor` over the product's own bands;
  `MarginTier` drops `stalled` and `untested` (both existed only because a velocity window could
  empty, and there is no velocity window any more) and the three remaining labels **invert** —
  `high` is now the slowest and best-paying. `MARGIN_TIER_META` blurbs and `marginTierHint` reword
  to the per-product bands and quote that product's real numbers. `roi` reads the band pct rather
  than `(payout − price) / price`.
- `src/components/admin/settings/CategoryManagement.tsx` — **delete** the windows/percentages
  editor block and its `tierFormError`/`pctFormError`/`toTierForm` helpers (~150 lines).
- `src/schemas/index.ts` — drop `MarginTierDaysSchema`/`MarginTierPctSchema` from the category
  schemas; add a `MarginBandsSchema` for the product.
- `src/app/admin/products/page.tsx` — the approval flow is where this phase is visible: Approve
  opens a panel with the three bands (days + pct) and the initial category, prefilled from the
  global defaults with the numbers shown, then approves. The label also becomes a column, free now
  that deriving it is two fields.
- `src/components/admin/ProductPricingPanel.tsx` — the same band editor for an already-live
  product, and **remove** the "ignored right now, your category charges X%" warning entirely: a
  per-product margin override can no longer be overruled, because categories no longer have
  percentages.
- `src/hooks/admin/mutations/useApplyMarginCategories.ts` and its export — **delete**.
- `InvestorFilterSidebar`, `PortfolioLiquidity`, `investor/earnings`, `investor/products`,
  `MarginTierBadge` (`InvestorCharts.tsx`), `ProductItem` — carry the 5-band → 3-band reduction and
  the inverted labels. The investor product card shows the **range** (`105 / 110 / 115` against the
  three windows) rather than one payout number, because the return genuinely depends on how long it
  takes and a single figure would be a guess presented as a fact.

### Checks

- `utils/marginBands.js` self-check — the user's worked example end to end: 100 at 20% margin lists
  at 120, investor pays 100, and sells at 8 / 12 / 40 days paying 105 / 110 / 115 with the platform
  keeping 15 / 10 / 5. Boundaries exactly on each threshold (10 days is low, 10.1 is medium,
  15 is medium, 15.1 is high), anything slower than the high window still high, the ascending
  invariant rejected in both directions, and a band pct above the platform margin rejected.
- `utils/pricingCalculator.js` self-check — the Phase 17 precedence assertions **delete** rather
  than invert (there is no tier argument left). The Phase 12 ones stay, including explicit `0%`
  being honoured rather than read as unset. Add: the band changing never moves `price`,
  `vendorPrice` or `investorPrice` — the regression this phase exists to prevent.
- A settlement check: one product, two investments, different `matchedAt`, different payouts; plus
  a legacy investment (null `marginBands`) still settling at its recorded `expectedPayout` beside
  them.
- `src/lib/investor/metrics.check.ts` — the same boundaries client-side, and `estDaysToSale`
  provably unaffected.

### Deliberately skipped

- **A stored label field.** Derived from two numbers now; storing it would just add a staleness bug.
- **Backfilling `marginBands` onto existing products.** They fall through to the global defaults,
  which is the Q4 answer applied to history as well as to new listings.
- **Rewriting existing unmatched investments.** They keep the deal they were sold. The null-bands
  snapshot is the whole mechanism.
- **Notifying investors when admin edits a product's bands.** The snapshot means it cannot affect
  them, so there is nothing urgent to tell them.

## Phase 21 — Return windows gate settlement

**BUILT 2026-11-04.** Confirmed with the user 2026-11-04 (answers a–f below). All checks pass:
five unit self-checks, a five-scenario integration run against the dev DB
(`scripts/returnWindow.check.js`), wallet reconciliation, `tsc` clean and `next build` compiling.

Three deviations from the plan as written:

- **`utils/matureSettlements.js` is named `utils/settlement.js`.** It ended up holding the whole
  settlement lifecycle — `stampMaturity`, `settleItem`, `settleOrderItems`, `matureDue`,
  `repoolItem` — not just maturation, so the narrower name would have been wrong.
- **The delivery backstop is a visible queue, not an auto-mark** (the open question in "The clock"
  below). `GET /admin/settlements/queue` returns `awaitingDeliveryMark`, and the panel lists
  shipped-but-unmarked orders. Auto-marking goods delivered that may never have arrived would
  release the customer's refund right on a guess, so admin decides. Still needs the user's blessing.
- **A replacement does not match a second investment** — stock decrements, no ledger rows, the
  original line matures on its original schedule. Assumption, flagged to the user, not confirmed.

Also found and fixed in passing, unrelated to this phase but blocking it:

- **`investments.paymentId` carried a stale UNIQUE index** while `investmentController` writes an
  explicit `paymentId: null` on every wallet-funded investment. `sparse` skips absent fields but
  indexes explicit nulls, so the first wallet-funded investment took the only null slot and every
  one after it died with E11000 — investing was broken outright in the dev DB. Fixed by
  `scripts/fixPaymentIdIndex.js` (drops the unique, keeps the sparse index the replay check uses).
- **`POST /payment/razorpay/refund` was guarded by `isAuthenticatedUser` alone**, so any logged-in
  customer could refund any payment id they could name. Now `authorizeRoles('admin')`.

A per-product return policy, and the thing it exists for: nobody is paid until the customer's
right to send the product back has expired. Today `settleOrder` credits the vendor and the
investor the moment an order is `Confirmed` — before it has shipped, let alone been delivered.

### The policy

Three fields on the product, admin-set, all resolved `product.X ?? settings.defaultX` so existing
products need no backfill (the Phase 20 trick):

```
returnWindowDays : Number|null   null -> settings.defaultReturnWindowDays (7)
returnPolicy     : 'full' | 'replacement_only' | 'none' | null
                                 null -> settings.defaultReturnPolicy ('full')
```

| policy | refund | replacement | holds money? | for |
|---|---|---|---|---|
| `full` | yes | yes | **yes** | the default |
| `replacement_only` | no | yes | no | swap-if-DOA goods |
| `none` | no | no | no | RAM, memory cards — sealed/consumable |

**Only `full` holds the money** (answer b). A replacement costs the *vendor* a physical unit, not
the investor their payout and not the platform any cash, so there is nothing for a hold to
protect. `replacement_only` and `none` settle at delivery.

### The money, restated

Settlement splits into two events that used to be one.

**At the sale** (`newOrder` → `settleOrder`): the unit is matched to the oldest unmatched
investment, FIFO, exactly as now — `status: 'matched'`, `matchedOrder`, `matchedAt` stamped. And
then nothing else. **No `Transaction` rows, no `creditSale`.** The ledger stays a record of money
that actually moved, so "pending" needs no new row type and no new wallet bucket: it is exactly
"a matched investment whose order has not matured".

**At maturation** (`deliveredAt + returnWindowDays`, nothing returned): the rows that used to be
written at the sale are written now — `vendor_earning`, `investor_payout`, `platform_profit` — and
`creditSale` moves the principal back to `capital` and the band's cut into `earnings`.

**The band is computed from `matchedAt`, not from the maturation date.** The investor's capital
stopped being at risk when the unit sold; the 7-day wait is a settlement delay, not extra time at
risk. `settlePayout(investment, investment.matchedAt)` already takes the clock as an argument, so
this is a call-site change and not a new rule. Getting this wrong would push every investor one
band higher and quietly cost the platform 5% of margin on every funded unit.

### The clock

Starts at **delivery** (answer a): `deliveredAt + returnWindowDays`, stored on the order line as
`maturesAt` when the order is marked `Delivered` so the due query is one indexed range scan
rather than a per-row date computation.

`deliveredAt` is set by an admin status change today. An order nobody marks `Delivered` therefore
never matures and never pays its vendor or investor. **Open — needs a decision before build:** a
backstop (treat as delivered N days after `shippedAt`) or an admin "overdue deliveries" queue.
The user was asked and answered only "after delivery clock start", so this is unresolved rather
than decided. Do not ship without one of the two — it is a silent non-payment bug.

### A return

Needs a new order status; `Returned` does not exist in the enum today. Admin marks it, and it is
refused when the product's policy is `none` or the window has already closed.

What happens is mostly what `reverseSettlement` already does, minus its hardest part:

- **The customer is refunded by the platform** (answer c), out of the payment it is still holding.
  Nobody has been paid yet, which is the whole point — the vendor could not fund a refund because
  the vendor has not been paid. Reuses `razorpayController.createRefund`.
- **No money to claw back.** This is the payoff: the current `reverseSettlement` debits the
  investor's `earnings`, which throws `InsufficientFunds` if they have already withdrawn the
  profit, leaving the order half-reversed and uncancellable. Nothing was credited, so that whole
  failure mode disappears.
- **The investment re-pools** — `unmatched`, `matchedOrder`/`matchedAt`/`payoutPct`/`payoutPaid`
  cleared — and **pays out on the next sale of that product** (answer c). Existing code path.

`Replaced` is a second status and moves no money: the sale stands, the customer keeps a product
they paid for, and the vendor eats the cost of the extra unit. Stock decrements; **no second
investment is matched** — assumption, not user-confirmed.

**Consequence worth accepting deliberately:** because the investment keeps its original
`createdAt`, a returned-then-resold unit has a longer days-held and can land in a *higher* band —
the investor earns more off a return they did not cause, and the platform's margin absorbs it.
This follows from the user's rule. The alternative (freeze the clock at first match) was not
requested.

### Maturation trigger (answer d — "whatever is best")

The backend is Vercel serverless (`vercel.json`), so there is no in-process cron and nothing in
`package.json` to schedule with. **One function, two triggers:**

- `utils/matureSettlements.js` — `matureDue(now)`: finds orders past `maturesAt` that are not
  `Returned`/`Cancelled` and settles them. Idempotent, so a double-fire is harmless.
- Vercel Cron, once a day, POSTing a protected endpoint (`CRON_SECRET` header). Daily is plenty of
  resolution for a 7-day window, and one run a day is inside the Hobby plan's limit.
- An admin **"Release due payouts"** button hitting the same function, as the fallback for a
  misconfigured cron and the only sane way to test this without waiting a week.

Rejected: maturing lazily on wallet/portfolio read. It spreads a money-moving write across every
read path, lands the ledger timestamp whenever someone happens to look, and still needs a trigger
for the vendor side, who may never log in.

### What the investor sees (answer e)

Derived on read, no third wallet bucket — a bucket would mean touching the `wallet.check.js`
reconciliation invariant for a figure that is two fields and a date.

- **Portfolio / investments:** per unit, "Sold — in return period until <date>", and a
  `maturingTotal` summing the payouts due.
- **Earnings:** a `maturing` line beside realised earnings, clearly not yet spendable.

### Existing products (answer f — "leave them if it doesn't break the math")

**Nothing retroactive, and no backfill.** `returnWindowDays`/`returnPolicy` are null on every
existing product and resolve to the 7-day `full` default, which changes **no amount anyone is
paid** — only the timing of future sales. Orders already settled are untouched; the gate reads the
order's own `maturesAt`, which only exists on orders delivered after this ships.

So the defaults do apply to the 7 live products, which is a deliberate reading of "leave them":
their math is unchanged, and the alternative (a permanent settle-immediately branch for pre-Phase-21
products) would mean two settlement paths forever.

### Also needs fixing, found while planning this

`POST /payment/razorpay/refund` is guarded by `isAuthenticatedUser` **only** — any logged-in
customer can refund any payment id they can name. The return flow makes this endpoint load-bearing,
so it becomes `authorizeRoles('admin')` and takes an order id rather than a raw `payment_id`.

### Checks

- `utils/matureSettlements.js` self-check — a `full` order matures only after `deliveredAt +
  window`; `none`/`replacement_only` mature at delivery; a `Returned` order never matures; running
  it twice credits once.
- The band comes from `matchedAt`, not maturation: a unit sold on day 8 and matured on day 16 pays
  the 8-day band. The regression that would otherwise cost margin on every unit.
- A return re-pools the investment and the next sale pays it, with no `InsufficientFunds` path left
  to hit.

## Phase 22 — Customers request a cancellation or a return; admin approves it

**BUILT 2026-11-04.** Answers confirmed with the user 2026-11-04. All checks pass: the
`utils/orderRequest.js` self-check, `scripts/orderRequest.check.js` (48 HTTP assertions across both
roles), every Phase 20/21 check still green, `tsc` clean and `next build` compiling.

One deviation, and one Phase 21 bug this phase exposed:

- **One modal, not two.** `RequestOrderActionModal` serves both types; they are the same shape and
  differ only in three details (items, mode, photos), so two components would have been two copies
  of the same form.
- **`replacement_only` had no window at all.** Phase 21 normalised `returnWindowDays` to 0 for every
  non-`full` policy, which is right for the MONEY (there is no refund to protect, so it settles at
  delivery) but was reused as the customer's right to act — making a replacement-only product
  un-swappable the instant it was delivered, defeating the entire policy. Fixed by splitting the two
  questions: `maturesAt()` (money) ignores the window for non-refundable policies, and the new
  `returnClosesAt()` (right to act) always honours it. `none` keeps a zeroed window, since nothing
  can ever be asked for. The admin editor now shows a "Days to report a fault" input for
  replacement-only, where it previously hid the control entirely.

Today only admin can cancel or return an order, from `/admin/orders/:id`. A customer looking at
`/orders/:id` has no action at all — they have to phone someone. This adds the request, the
approval, and nothing else: the actual money movement is entirely Phase 21's, already built and
tested.

### What the customer can ask for, and when

Keyed on delivery, because that is the moment the question changes (answer a):

```
not delivered yet   ->  CANCEL   (reason text only)
delivered           ->  RETURN   (reason text + optional photos)
```

A cancel after delivery is refused — the goods are already with the customer, so the only sensible
request is a return. A return before delivery is refused for the mirror reason; `returnWindowState`
in utils/returnPolicy.js already says exactly that.

**Return mode follows the product's policy, per item (answer b):**

| policy | what the customer may ask for |
|---|---|
| `full` | refund **or** replacement — they choose |
| `replacement_only` | replacement only, no choice offered (there is one option) |
| `none` | nothing; the item is listed as ineligible with the reason |

The choice is only ever presented when there genuinely is one.

**Per item, not per order (answer c).** A mixed cart can hold a 3-day memory card, a 7-day tile and
a non-returnable stick of RAM. The customer ticks the items they are returning; ineligible lines are
shown greyed with why, and an eligible selection is required to submit. Phase 21's returns are
already per-line, so this is the grain the money already moves at.

### The request

New model, `models/orderRequestModel.js`:

```
order, user                     who and what
type        'cancel' | 'return'
mode        'refund' | 'replacement' | null      null for a cancel
items       [{ product, name, quantity }]        empty for a cancel (whole order)
reason      String, required                     the text box
images      [{ public_id, url }]                 Cloudinary, returns only, max 5, optional
status      'pending' | 'approved' | 'rejected'
adminNote   String                               why it was rejected, shown to the customer
decidedBy, decidedAt
```

Images go to Cloudinary exactly as product images already do (`cloudinary.v2.uploader.upload`),
folder `order-requests`. JPEG/PNG/WebP, ~5MB each, up to 5. Optional — "if the customer wants to".

### Rules the user confirmed

- **Both types need admin approval.** Per the original brief. Worth noting a cancel on an order
  still sitting in `Confirmed` costs nothing to grant, so this is a deliberate choice to keep a
  human in the loop rather than a technical constraint.
- **One open request per order** (answer e). A second is refused while one is pending.
- **A rejection is final** (answer f). No re-request — `status: 'rejected'` permanently closes the
  order to further requests, and the UI says so rather than offering a button that will fail.

### Where admin sees it (answer d)

On the order page, `/admin/orders/:id` — a panel above the status manager, with Approve and Reject
(reject requires a note, since the customer is shown it).

**Plus a badge on the orders list**, which the user did not ask for and which is needed anyway: a
request that only appears inside one order detail page is a request nobody finds. The existing
Phase-21 status filter on `/admin/orders` gains a "Request pending" chip, and the row shows a dot.
This is discoverability for a feature that otherwise relies on admin opening all 10 orders daily.

### Approval does nothing new

This is the whole reason the phase is small. Approving calls the code that already exists:

```
cancel      approved -> the Cancelled branch of updateOrder  (reverseSettlement + restoreStock)
return      approved -> the Returned branch   (refundOrderItems + repoolItem, per item)
            mode 'replacement' -> the Replaced branch (no money moves)
reject      ->  status 'rejected' + adminNote. The order is untouched.
```

The Returned branch is currently whole-order; it grows an optional item filter so an approved
request returns exactly the lines the customer ticked. That is the only change to Phase 21 logic.

### A pending request must PAUSE maturation — the bug this phase would otherwise ship

Phase 21 releases a line's money at `deliveredAt + returnWindowDays`, on a daily cron. So:

```
day 0   delivered, 7-day window
day 6   customer requests a return      <- money still held, fine
day 7   cron fires, window has closed   <- VENDOR AND INVESTOR GET PAID
day 8   admin approves the return       <- the money is already gone
```

At that point the refund has to claw back from an investor who may have withdrawn it, which is
exactly the `InsufficientFunds` failure Phase 21 was built to delete. So:

- `matureDue()` excludes any line belonging to an order with a **pending** request.
- A rejection releases the hold — if the window has since closed, the next run pays out normally.
- The admin queue shows these as "held — return requested" rather than silently overdue, so a
  request nobody decides cannot quietly freeze a vendor's money forever.

### Build

**Backend**
- `models/orderRequestModel.js` — as above. Index `{ order: 1, status: 1 }` for the pause check.
- `controllers/orderRequestController.js`
  - `POST /order/:id/request` — customer. Validates type against delivery state, mode against each
    item's snapshotted policy, the window via `returnWindowState`, one-open-request, and uploads
    the images. Returns the created request.
  - `GET /order/:id/request` — customer, the status of their own request.
  - `PUT /admin/order-request/:id` — admin, `{ status, adminNote }`. On approve, dispatches into the
    existing cancel/return/replace flows.
  - `GET /admin/order-requests?status=pending` — the list behind the badge and the chip.
- `routes/orderRequestRoute.js`, mounted in `app.js`.
- `utils/settlement.js` — `matureDue()` skips orders with a pending request.
- `controllers/orderController.js` — the Returned branch takes an optional item filter.
- `controllers/settlementController.js` — the queue labels request-held lines.

**Frontend**
- `src/app/(user)/orders/[id]/page.tsx` — the two buttons, gated on delivery state, plus the
  current request's status and any rejection note.
- `src/components/orders/RequestCancelModal.tsx` — reason text only.
- `src/components/orders/RequestReturnModal.tsx` — item checkboxes with per-item eligibility,
  refund/replacement choice where the policy allows both, reason, and the image dropzone with
  previews and client-side type/size/count validation.
- `src/components/admin/OrderRequestPanel.tsx` — the request, its photos in a lightbox, Approve /
  Reject with a required note.
- `src/app/admin/orders/page.tsx` — the "Request pending" chip and the row dot.
- `src/hooks/order/` — `useOrderRequest`, `useCreateOrderRequest`, `useDecideOrderRequest`.

**Checks**
- `utils/orderRequest.check.js` self-check — which type is allowed at which order status, which
  modes a policy permits, the one-open-request rule, and that a rejection closes the order.
- `scripts/orderRequest.check.js` — HTTP, end to end: customer requests, admin approves, the money
  actually moves the Phase 21 way; a rejected request moves nothing and cannot be re-filed; a
  pending request stops `matureDue()` from paying out, and a rejection un-freezes it.
- Extend `scripts/returnWindow.e2e.js` with the request path alongside the direct admin path.

### Deliberately skipped

- **Customer-initiated partial refunds of a different amount.** The refund is the proportion of
  `totalPrice` the returned lines represent, as Phase 21 already computes.
- **Notification emails on approve/reject.** `sendEmail` exists and this should use it, but it is a
  separate concern from the workflow and the templates do not exist yet.
- **A separate admin Requests page.** The user chose the order detail page; the list badge covers
  finding them.

## Phase 23 — The seven mandatory fixes from the end-to-end audit

**BUILT 2026-11-05.** Found by auditing the running app against the live database rather than by
reading it; each fix has an assertion in `scripts/phase23.check.js` that would have failed before.

### 1. Checkout accepted a fabricated payment (critical)

`/order/new` recorded `totalPrice` from the request body and took `paymentInfo` on trust. Proven
against the dev DB: a made-up payment id and `totalPrice: 1` created a **Confirmed** order for a
₹90 product and decremented its stock. Anyone with a login could order anything for free.

Now the server prices the cart from the database (`utils/orderTotals.js`), fetches the payment from
Razorpay, and refuses anything that does not cover the total. Also fixed in the same path: the
one-payment-one-order check compared the whole `paymentInfo` object (so the same id with a different
`status` string slipped past), stock was decremented without being checked, and a tampered line
name or price reached the order. Order items are now rebuilt from the database.

### 2. Coupons silently inverted the platform's profit

Settlement priced every unit at `product.price` and never looked at `discountAmount`, so a discount
was absorbed by nobody and reported by nothing:

```
20% margin, listed 120, vendor nets 100, investor funded (105 payout)
coupon  -0   ledger said +15   reality +15
coupon -20   ledger said +15   reality  -5
coupon -40   ledger said +15   reality -25
```

Nothing capped a coupon against the margin either, so this was reachable. Three changes: the
discount is allocated across lines and settlement uses that `netUnitPrice`; a coupon is capped at
`marginInCart()`; and GST is charged on the discounted subtotal rather than the full one.

**Also stored now:** `itemsPrice`, `taxPrice`, `shippingPrice`. The checkout always sent them and
the schema always dropped them, leaving one lump sum — which made an invoice impossible to
reconstruct, a GST return impossible to file, and a refund impossible to price (the Phase 21 refund
fix had already worked around this by allocating `totalPrice`).

**One authority.** `priceOrder()` now backs `/order/quote` (new), the coupon validator and
`/order/new`. Both clients ask for the figure they are about to charge rather than computing it, so
an admin changing the GST rate or the shipping fee cannot start refusing every order. Shipping moved
into platform settings for the same reason — it was hardcoded in three clients.

### 3. Vendors could not be paid

`vendor_earning` rows accumulated with no vendor wallet, no withdrawal and no payout;
`vendorProfile.payoutDetails` was collected and never read. Every vendor was paid by manual bank
transfer with nothing recording what had been settled.

Vendors now share the investor wallet and the same RazorpayX flow: maturation credits
`creditVendorSale` to `earnings`, `/wallet` and `/withdrawals` accept the vendor role, and
`withdrawalController` reads bank details off `vendorProfile` (see `profileKeyFor`). Top-up stays
investor-only — a vendor has nothing to deploy capital into. New `/vendor/payouts` page.

### 4. Investable capacity double-counted every sale

Lifetime `countDocuments({ product })` against *current* stock, so each sale consumed a slot and a
stock unit both: stock 10 with 5 funded and 5 sold read as 0 remaining while 5 unfunded units sat on
the shelf. Now counts `status: 'unmatched'` — a sold unit's stock left with it, so its slot frees.

### 5. Lowering the margin left bands above it

`bandsError` only ran on save, so dropping the global margin 20% → 8% left products paying investors
15% out of an 8% margin. Now clamped on the margin save, products and platform defaults both.

**One-way, deliberately:** the old percentages are overwritten, and raising the margin back does not
restore them. The response says so explicitly. (This was found by the clamp breaking three later
test suites — `phase23.check.js` now restores what it clamps.)

### 6. No login rate limit

Unlimited password guesses. Five failures locks the account for fifteen minutes, counted on the
**user document** rather than in process memory — the backend is Vercel serverless, where an
in-memory counter resets on every cold start and is not shared between instances. A locked account
is not counted against further, so hammering it cannot extend its own lock.

### 7. Anyone could review any product

No purchase check at all. Now requires an order containing that product in `Delivered`, `Replaced`
or `Returned` — keyed on delivery, so a cancelled order cannot be used.

### Decision worth revisiting

**Shipping is refunded on a return.** A full return hands back the whole charge including the ₹200
delivery; a partial return hands back that line's share. Most retailers keep the shipping on a
change-of-mind return. It is one subtraction in `refundOrderItems` if you want that — the
customer-favourable default was chosen because it needs no judgement call per return.

### Checks

`utils/orderTotals.js` self-check (the allocation arithmetic, the margin ceiling, rounding at
awkward numbers), `scripts/phase23.check.js` (52 HTTP assertions across all seven fixes plus the
quote/validator/order agreement), and the whole Phase 20–22 suite re-run twice to prove no
order-dependence. `returnWindow.e2e.js` and `orderRequest.check.js` were updated to quote their
totals server-side — their hand-rolled GST-only figures were refused, which is the fix working.
