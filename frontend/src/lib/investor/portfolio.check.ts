/**
 * Self-check for the portfolio aggregation.
 *
 * Run with:  node --experimental-strip-types src/lib/investor/portfolio.check.ts
 */

import assert from "node:assert";
import { buildPositions, portfolioTotals, formatDuration, formatDate, returnDaysLeft, formatDaysLeft } from "./portfolio.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12); // fixed clock so "held" durations are stable

const unit = (over: any) => ({
  _id: over._id,
  product: { _id: over.productId, name: over.productName, images: [] },
  amountInvested: 100,
  expectedPayout: 120,
  status: "unmatched",
  matchedAt: null,
  refundedTotal: 0,
  realisedPayout: 0,
  refundFailed: false,
  createdAt: new Date(NOW - 30 * DAY).toISOString(),
  ...over,
});

// --- One product, one sold unit and one still waiting -------------------
{
  const positions = buildPositions(
    [
      unit({
        _id: "a",
        productId: "p1",
        productName: "Tile A",
        status: "matched",
        matchedAt: new Date(NOW - 10 * DAY).toISOString(),
        realisedPayout: 120,
      }),
      unit({ _id: "b", productId: "p1", productName: "Tile A" }),
    ],
    NOW
  );

  assert.strictEqual(positions.length, 1, "units of one product collapse into one position");
  const p = positions[0];

  assert.strictEqual(p.unitsTotal, 2);
  assert.strictEqual(p.unitsSold, 1);
  assert.strictEqual(p.unitsWaiting, 1);
  assert.strictEqual(p.capitalDeployed, 200);
  assert.strictEqual(p.atRisk, 100, "only the unsold unit is at risk");
  assert.strictEqual(p.realisedProfit, 20, "the sold unit actually paid out 120 on 100");
  assert.strictEqual(p.unrealisedProfit, 20, "the waiting unit expects 20, not earned yet");
  assert.strictEqual(p.avgBuyPrice, 100);
  assert.strictEqual(p.avgDaysToSell, 20, "funded 30d ago, sold 10d ago");
  assert.strictEqual(p.longestWaitDays, 30);
  assert.strictEqual(Math.round(p.roi), 20);
}

// --- Realised and unrealised must never be summed into one figure -------
{
  const positions = buildPositions(
    [unit({ _id: "a", productId: "p1", productName: "Tile A" })],
    NOW
  );
  const t = portfolioTotals(positions);

  assert.strictEqual(t.realisedProfit, 0, "nothing has sold, so nothing is realised");
  assert.strictEqual(t.unrealisedProfit, 20);
  assert.strictEqual(t.atRisk, 100);
  assert.strictEqual(t.avgDaysToSell, null, "no sales => no average, not 0");
  assert.strictEqual(t.realisedRoi, 0);
}

// --- A price drop: capital partly refunded, terms rewritten -------------
{
  // Funded at 100 expecting 120; vendor dropped the price, 25 came back and
  // the unit was rewritten to 75 -> 90. The investor's 20% is intact.
  const positions = buildPositions(
    [
      unit({
        _id: "a",
        productId: "p1",
        productName: "Tile A",
        amountInvested: 75,
        expectedPayout: 90,
        refundedTotal: 25,
      }),
    ],
    NOW
  );

  const p = positions[0];
  assert.strictEqual(p.atRisk, 75, "only what is still staked counts as at risk");
  assert.strictEqual(p.refundedTotal, 25);
  assert.strictEqual(p.unrealisedProfit, 15);
  assert.strictEqual(Math.round(p.units[0].roi), 20, "still a 20% return after the reprice");
}

// --- Legacy row with no ledger payout must not read as a total loss -----
{
  const positions = buildPositions(
    [
      unit({
        _id: "legacy",
        productId: "p1",
        productName: "Tile A",
        status: "matched",
        matchedAt: new Date(NOW - 5 * DAY).toISOString(),
        realisedPayout: 0, // predates per-investment ledger rows
      }),
    ],
    NOW
  );

  assert.strictEqual(
    positions[0].realisedProfit,
    20,
    "falls back to expectedPayout instead of reporting -100"
  );
}

// --- Several products roll up correctly ---------------------------------
{
  const positions = buildPositions(
    [
      unit({ _id: "a", productId: "p1", productName: "Tile A" }),
      unit({ _id: "b", productId: "p2", productName: "Tile B", amountInvested: 250, expectedPayout: 300 }),
      unit({
        _id: "c",
        productId: "p2",
        productName: "Tile B",
        amountInvested: 250,
        expectedPayout: 300,
        status: "matched",
        matchedAt: new Date(NOW - 2 * DAY).toISOString(),
        realisedPayout: 300,
        refundFailed: true,
      }),
    ],
    NOW
  );
  const t = portfolioTotals(positions);

  assert.strictEqual(t.productCount, 2);
  assert.strictEqual(t.unitsTotal, 3);
  assert.strictEqual(t.capitalDeployed, 600);
  assert.strictEqual(t.atRisk, 350, "100 + 250 still unsold");
  assert.strictEqual(t.realisedProfit, 50);
  assert.strictEqual(t.unrealisedProfit, 70, "20 + 50");
  assert.strictEqual(t.realisedRoi, 20, "50 profit on the 250 that sold");
  assert.strictEqual(t.refundFailedCount, 1, "money still owed is surfaced");
}

// --- Nothing produces NaN on a bare/missing-field investment ------------
{
  const positions = buildPositions([{ _id: "x", product: "p9" }], NOW);
  const t = portfolioTotals(positions);
  for (const [key, value] of Object.entries(t)) {
    if (typeof value === "number") {
      assert.ok(!Number.isNaN(value), `${key} was NaN`);
    }
  }
  assert.strictEqual(positions[0].productName, "Unlisted product");
}

// --- Formatters ---------------------------------------------------------
assert.strictEqual(formatDuration(null), "—");
assert.strictEqual(formatDuration(0.4), "today");
assert.strictEqual(formatDuration(1), "1 day");
assert.strictEqual(formatDuration(45), "45 days");
assert.strictEqual(formatDuration(91), "3.0 months");
assert.strictEqual(formatDate(null), "—");

console.log("portfolio: all checks passed");

// ── Phase 21: the return-window countdown ───────────────────────────────
//
// What an investor reads off the portfolio while their money is held.
{
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 0, 10);

  // Null means the order is not delivered yet — the clock has NOT started, so
  // this must not read as "0 days left".
  assert.strictEqual(returnDaysLeft(null, now), null);
  assert.strictEqual(formatDaysLeft(null, now), "awaiting delivery");

  // A plain multi-day wait.
  assert.strictEqual(returnDaysLeft(now + 7 * DAY, now), 7);
  assert.strictEqual(formatDaysLeft(now + 7 * DAY, now), "7 days left");
  assert.strictEqual(formatDaysLeft(now + 3 * DAY, now), "3 days left");

  // Rounded UP: six hours left is still a day to someone waiting on it.
  assert.strictEqual(returnDaysLeft(now + DAY / 4, now), 1);
  assert.strictEqual(formatDaysLeft(now + DAY / 4, now), "last day");
  assert.strictEqual(formatDaysLeft(now + 1 * DAY, now), "last day");
  // Just over a day is 2, not 1.
  assert.strictEqual(returnDaysLeft(now + 1.1 * DAY, now), 2);

  // Exactly now, and past: due for release, never negative.
  assert.strictEqual(returnDaysLeft(now, now), 0);
  assert.strictEqual(formatDaysLeft(now, now), "releasing now");
  assert.strictEqual(returnDaysLeft(now - 30 * DAY, now), 0, "never goes negative");
  assert.strictEqual(formatDaysLeft(now - 30 * DAY, now), "releasing now");

  // A 3-day window and a 7-day window on the same day differ by 4.
  assert.strictEqual(
    returnDaysLeft(now + 7 * DAY, now)! - returnDaysLeft(now + 3 * DAY, now)!,
    4
  );
}

console.log("portfolio: return-window countdown checks passed");
