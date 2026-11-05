"use client";

import { FiAlertTriangle, FiCheckCircle, FiClock, FiHelpCircle, FiXCircle } from "react-icons/fi";
import {
  MARGIN_TIER_META,
  marginTierHint,
  formatWait,
  type MarginTier,
  type MarginBands,
} from "@/lib/investor/metrics";

/**
 * Investor chart primitives. Deliberately plain SVG/divs — a 12-bar sparkline
 * and a progress meter do not justify a charting dependency.
 *
 * Colour follows the project's data-viz rules:
 *  • The sparkline is ONE series over time, so it gets ONE hue. A light→dark
 *    ramp across the bars would double-encode magnitude, which bar length
 *    already carries.
 *  • The margin band uses the reserved status palette, and always ships an icon and a
 *    text label so the state never depends on colour alone.
 *  • Chrome (baseline, track) is a recessive hairline; marks are thin with 4px
 *    rounded ends anchored to the baseline and a 2px gap between bars.
 */

// The investor surface is emerald-themed, so emerald is this chart system's
// series hue rather than the reference blue — validated against the white
// chart surface (lightness band, chroma floor and >=3:1 contrast all pass).
// emerald-500 (#10b981) was rejected: it only reaches 2.54:1.
const SERIES = "#059669";        // emerald-600 — 3.7:1 on white
const SERIES_SOFT = "#d1fae5";   // emerald-100 — the empty track
const GRID = "#e1e0d9";          // hairline gridline
const MUTED = "#898781";         // axis/label ink

const STATUS_COLOR: Record<string, string> = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  neutral: MUTED,
};

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  good: FiCheckCircle,
  warning: FiClock,
  serious: FiAlertTriangle,
  critical: FiXCircle,
  neutral: FiHelpCircle,
};

/* ------------------------------------------------------------------ */
/* Sales velocity sparkline                                            */
/* ------------------------------------------------------------------ */

interface SalesSparklineProps {
  /** Units sold per week, oldest first. */
  data: number[];
  /** Height of the plot area in px. */
  height?: number;
  /** Shows the "units/wk" axis label and week ticks. */
  showAxis?: boolean;
}

export function SalesSparkline({ data, height = 44, showAxis = false }: SalesSparklineProps) {
  const max = Math.max(...data, 1);
  const weeks = data.length;
  const total = data.reduce((sum, n) => sum + n, 0);

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed"
        style={{ height, borderColor: GRID }}
      >
        <span className="text-[11px]" style={{ color: MUTED }}>
          No sales in the last {weeks} weeks
        </span>
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex items-end gap-[2px]"
        style={{ height }}
        role="img"
        aria-label={`Units sold per week over the last ${weeks} weeks: ${data.join(", ")}`}
      >
        {data.map((value, i) => {
          // Zero weeks still get a 2px stub so "sold nothing" reads as a real
          // data point rather than a gap in the chart.
          const barHeight = value === 0 ? 2 : Math.max(4, (value / max) * height);
          const weeksAgo = weeks - 1 - i;
          return (
            // Named group: this sparkline renders inside cards that already
            // carry a bare `group` class, and a plain `group-hover:` would
            // match that ancestor too — popping all 12 tooltips open at once
            // whenever the card is hovered.
            <div key={i} className="group/bar relative flex-1 flex items-end" style={{ height }}>
              <div
                className="w-full transition-opacity group-hover/bar:opacity-70"
                style={{
                  height: barHeight,
                  background: value === 0 ? GRID : SERIES,
                  borderRadius: value === 0 ? 1 : "4px 4px 0 0",
                }}
              />
              {/* Hover layer — the chart is interactive by default */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover/bar:block">
                {value} unit{value === 1 ? "" : "s"}
                <span className="ml-1 text-slate-300">
                  {weeksAgo === 0 ? "this week" : `${weeksAgo}w ago`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {showAxis && (
        <div className="mt-1 flex items-center justify-between text-[10px]" style={{ color: MUTED }}>
          <span>{weeks}w ago</span>
          <span className="tabular-nums">peak {max}/wk</span>
          <span>now</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Funding meter                                                       */
/* ------------------------------------------------------------------ */

interface FundingMeterProps {
  /** 0–100 */
  pct: number;
  investedUnits: number;
  investableUnits: number;
}

export function FundingMeter({ pct, investedUnits, investableUnits }: FundingMeterProps) {
  const clamped = Math.min(100, Math.max(0, pct));

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span style={{ color: MUTED }}>Funded by investors</span>
        <span className="font-semibold tabular-nums text-slate-700">
          {investedUnits}/{investableUnits} units
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: SERIES_SOFT }}
        role="meter"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${Math.round(clamped)}% of investable units funded`}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, background: SERIES }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Margin band badge — status colour + icon + label, never colour alone */
/* ------------------------------------------------------------------ */

export function MarginTierBadge({
  tier,
  marginBands,
  estDaysToSale,
  compact = false,
}: {
  tier: MarginTier;
  /** This product's own bands, so the tooltip quotes real days and %. */
  marginBands?: MarginBands;
  estDaysToSale?: number | null;
  compact?: boolean;
}) {
  const meta = MARGIN_TIER_META[tier];
  const color = STATUS_COLOR[meta.tone];
  const Icon = STATUS_ICON[meta.tone];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ color, borderColor: `${color}55`, background: `${color}12` }}
      title={marginTierHint(tier, marginBands)}
    >
      <Icon className="h-3 w-3 flex-shrink-0" />
      {compact ? meta.label : `${meta.label}${estDaysToSale ? ` · ~${formatWait(estDaysToSale)}` : ""}`}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Stat tile — a single number is a tile, not a one-bar chart           */
/* ------------------------------------------------------------------ */

export function StatTile({
  label,
  value,
  sub,
  hint,
  emphasis = false,
  isPercent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  emphasis?: boolean;
  /**
   * Renders the value in brand gold — percentages are gold across investor
   * screens. A prop rather than making every caller pass JSX, since `value`
   * is a preformatted string ("20.0%", "≈240%/yr").
   *
   * Uses the AA-safe gold: the tile sits on white, where brand gold is only
   * 2.09:1. See components/investor/Pct.tsx.
   */
  isPercent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3" title={hint}>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: MUTED }}>
        {label}
      </p>
      <p
        className={`mt-0.5 font-semibold tabular-nums ${emphasis ? "text-2xl" : "text-lg"} ${
          isPercent ? "text-brand-gold-text" : ""
        }`}
        style={isPercent ? undefined : { color: emphasis ? SERIES : "#0b0b0b" }}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}
