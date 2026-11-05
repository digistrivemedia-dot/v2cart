import { cn } from "@/lib/utils";

/**
 * A percentage, in brand gold.
 *
 * Every percentage on an investor screen goes through this, so the colour is
 * decided once rather than as a class name repeated across a dozen files.
 * Investor screens only — customer and vendor pages keep their own palettes.
 *
 * ── Why two golds ──────────────────────────────────────────────────────────
 *
 * Brand gold (#d4af37) measures 2.09:1 against white, well under the 4.5:1
 * WCAG AA needs for text this size, so using it on a light background would
 * make the numbers technically gold and practically unreadable. `onDark`
 * picks between:
 *
 *   light surface → gold-text (#8a6d1f), 4.87:1 on white
 *   dark surface  → gold      (#d4af37), 8.02:1 on brand navy
 *
 * Formatting stays at the call site: these numbers are variously "+20.0%",
 * "≈240%/yr" and "<1%", and centralising that would mean a prop per variant.
 */
export function Pct({
  children,
  onDark = false,
  className,
  ...rest
}: React.ComponentPropsWithoutRef<"span"> & {
  /** True when the percentage sits on navy or another dark fill. */
  onDark?: boolean;
}) {
  return (
    <span
      {...rest}
      className={cn(
        "font-semibold tabular-nums",
        onDark ? "text-brand-gold" : "text-brand-gold-text",
        className
      )}
    >
      {children}
    </span>
  );
}
