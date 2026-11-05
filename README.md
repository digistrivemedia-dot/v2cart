# InveztIN

An e-commerce marketplace with an investor side: vendors list products, customers buy them, and
investors fund individual units of stock and earn a share when those units sell.

```
investin/
  backend/    Express + MongoDB API            :4000
  frontend/   Next.js web app                  :3000
  mobile/     Expo customer app
```

## Running it

```bash
npm run install:all     # first time only
npm run dev             # backend + frontend together
```

Separately, if you prefer:

```bash
npm run dev:backend     # :4000
npm run dev:frontend    # :3000
npm run dev:mobile      # Expo
```

`backend/config/config.env` is **not** in the repo — it holds the database URI, the JWT secret and
the payment keys. Copy `backend/config/config.env.example` to `backend/config/config.env` and fill
it in. `frontend/.env.local` needs one line:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

Set `PAYMENTS_MOCK=true` in the backend env to work without live Razorpay keys — the gateway is
stubbed end to end, including the proofs the checkout needs.

## The money model

The number a vendor types is what they receive. Everything else is derived from it:

```
vendor types          100     what the vendor is paid per unit
listing price         120     price = net x (1 + marginPct)   <- the customer sees this
investor pays         100     an investor funds a unit at the vendor's net
customer pays       141.60    listing + GST, plus shipping under the free threshold
```

An investor's return is a slice **of the platform's margin**, sized by how long their unit took to
sell — fast money earns less because the capital came back sooner:

| band | sells within | investor earns | investor | platform keeps |
|---|---|---|---|---|
| low | 10 days | 5% | 100 → 105 | 15 |
| medium | 15 days | 10% | 100 → 110 | 10 |
| high | slower | 15% | 100 → 115 | 5 |

`high` is the slowest and best-paying band — the name tracks the percentage, not the speed.

**Nobody is paid at checkout.** A sale only matches the unit to its investor; the vendor's and the
investor's money is released once the customer's return window closes with nothing sent back. A
pending cancellation or return request freezes that release until an admin decides.

Full design history, all 23 phases: [`MARKETPLACE_CONVERSION_PLAN.md`](MARKETPLACE_CONVERSION_PLAN.md).
Click-through test steps per feature: [`TESTING_DASHBOARDS.txt`](TESTING_DASHBOARDS.txt).

## Checks

```bash
npm run check           # unit checks: no database, no server needed
npm run check:all       # the above plus the API suite (needs the server running)
```

The money rules carry their own assertions — `node backend/utils/marginBands.js` runs the band
arithmetic, `node backend/utils/orderTotals.js` the pricing and discount allocation, and so on. The
API suite drives real HTTP against a running server:

```bash
npm run dev:backend                             # in one shell
npm --prefix backend run check:api              # in another
```

`backend/scripts/wallet.check.js --reconcile` is safe against production: it asserts every stored
wallet balance matches the sum of its ledger rows and writes nothing.

## Scheduled work

Payouts whose return window has closed are released daily by a cron hitting
`/api/v1/cron/mature-settlements`, guarded by `CRON_SECRET` (see `backend/vercel.json`). Admin can
also release them by hand from Reports. Both are idempotent.

To exercise a 7-day window without waiting a week:

```bash
node backend/scripts/closeReturnWindow.js            # list what is held
node backend/scripts/closeReturnWindow.js <orderId>  # make it due now
```

## One-off migrations

Run these against any database restored from before 2026-11:

```bash
node backend/scripts/fixPaymentIdIndex.js    # drops a stale unique index that breaks investing
node backend/scripts/removeSuperadmin.js     # renames superadmin_* ledger rows to platform_*
```
