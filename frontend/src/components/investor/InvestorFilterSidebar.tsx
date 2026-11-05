"use client";

import { useState } from "react";
import { FaChevronDown, FaChevronUp, FaFilter, FaTimes } from "react-icons/fa";
import { MARGIN_TIER_META, MARGIN_TIER_ORDER, type MarginTier } from "@/lib/investor/metrics";
import { Pct } from "./Pct";

// Investor-side twin of components/search/FilterSidebar. Same visual language
// (sticky desktop aside + mobile drawer + collapsible sections) but driven by
// local state instead of URL params: /investor/products already has the whole
// investable list in memory from one fetch, so filtering is instant and there
// is nothing to navigate to.
export type InvestorFilters = {
  categories: string[];
  tags: string[];
  minPrice: string;
  maxPrice: string;
  /**
   * Minimum annualised return. Replaced the old min/max ROI filter: every
   * product now returns exactly the platform margin, so filtering on the flat
   * return % matches either everything or nothing. Annualised return varies
   * because turnover speed varies, so that's what's worth filtering on.
   */
  minAnnualised: string;
  /** Hide listings whose estimated wait for a new unit exceeds this. */
  maxWaitDays: string;
  /**
   * Margin categories to include; empty means all. Phase 16: the tier is
   * derived from sell speed against the windows admin set on the product's
   * category, so this is a real dimension to slice on, not a hint.
   */
  marginTiers: MarginTier[];
  minUnits: string;
  availability: "all" | "available" | "filling" | "funded";
};

// Defaults to hiding fully-funded listings — an investor can't act on those,
// and the "Availability" radio shows plainly that the filter is on.
export const DEFAULT_INVESTOR_FILTERS: InvestorFilters = {
  categories: [],
  tags: [],
  minPrice: "",
  maxPrice: "",
  minAnnualised: "",
  maxWaitDays: "",
  marginTiers: [],
  minUnits: "",
  availability: "available",
};

export type FilterOption = { label: string; value: string; count: number };

export const countActiveFilters = (f: InvestorFilters) =>
  f.categories.length +
  f.tags.length +
  f.marginTiers.length +
  [f.minPrice, f.maxPrice, f.minAnnualised, f.maxWaitDays, f.minUnits].filter(Boolean).length +
  (f.availability !== "all" ? 1 : 0);

const AVAILABILITY_OPTIONS: { label: string; value: InvestorFilters["availability"]; hint: string }[] = [
  { label: "All listings", value: "all", hint: "Including fully funded" },
  { label: "Available now", value: "available", hint: "At least 1 unit open" },
  { label: "Filling fast", value: "filling", hint: "Over half already funded" },
  { label: "Fully funded", value: "funded", hint: "Nothing left to invest" },
];

interface SectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  last?: boolean;
  children: React.ReactNode;
}

const Section = ({ title, open, onToggle, last, children }: SectionProps) => (
  <div className={last ? "mb-6" : "mb-6 pb-6 border-b border-gray-200"}>
    <button onClick={onToggle} className="flex items-center justify-between w-full mb-3">
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {open ? (
        <FaChevronUp className="text-slate-600 text-sm" />
      ) : (
        <FaChevronDown className="text-slate-600 text-sm" />
      )}
    </button>
    {open && children}
  </div>
);

interface CheckListProps {
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string, checked: boolean) => void;
}

const CheckList = ({ options, selected, onToggle }: CheckListProps) => (
  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
    {options.map((option) => (
      <label key={option.value} className="flex items-center justify-between cursor-pointer group">
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="checkbox"
            checked={selected.includes(option.value)}
            onChange={(e) => onToggle(option.value, e.target.checked)}
            className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer flex-shrink-0"
          />
          <span className="text-sm text-slate-700 group-hover:text-emerald-600 truncate">
            {option.label}
          </span>
        </div>
        <span className="text-xs text-gray-500 ml-1 flex-shrink-0">({option.count})</span>
      </label>
    ))}
  </div>
);

const numberInputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

interface InvestorFilterSidebarProps {
  filters: InvestorFilters;
  onChange: (patch: Partial<InvestorFilters>) => void;
  onClear: () => void;
  categoryOptions: FilterOption[];
  tagOptions: FilterOption[];
  /** Observed min/max across all investable products, shown as input hints. */
  priceBounds: { min: number; max: number };
  /** Observed annualised-return range, shown as an input hint. */
  annualisedBounds: { min: number; max: number };
  /** How many listings fall in each margin band. */
  marginTierCounts: Record<string, number>;
}

export const InvestorFilterSidebar = ({
  filters,
  onChange,
  onClear,
  categoryOptions,
  tagOptions,
  priceBounds,
  annualisedBounds,
  marginTierCounts,
}: InvestorFilterSidebarProps) => {
  const [openSections, setOpenSections] = useState<string[]>([
    "Margin Band",
    "Annualised Return",
    "Investment per Unit",
    "Availability",
  ]);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSection = (title: string) =>
    setOpenSections((prev) =>
      prev.includes(title) ? prev.filter((s) => s !== title) : [...prev, title]
    );

  const toggleInList = (key: "categories" | "tags") => (value: string, checked: boolean) =>
    onChange({
      [key]: checked
        ? [...filters[key], value]
        : filters[key].filter((v) => v !== value),
    });

  const toggleMarginTier = (value: MarginTier, checked: boolean) =>
    onChange({
      marginTiers: checked
        ? [...filters.marginTiers, value]
        : filters.marginTiers.filter((v) => v !== value),
    });

  const activeFilterCount = countActiveFilters(filters);

  const FilterContent = (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800">Filters</h2>
        <button
          onClick={onClear}
          className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
        >
          Clear All
        </button>
      </div>

      {/* Margin band — what a product pays an investor, by how long the unit
          takes to sell. The days and percentages are set per product by admin,
          so the labels here stay relative rather than quoting numbers that are
          only true for one listing; a product card quotes its own. */}
      <Section
        title="Margin Band"
        open={openSections.includes("Margin Band")}
        onToggle={() => toggleSection("Margin Band")}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            {MARGIN_TIER_ORDER.map((value) => {
              const meta = MARGIN_TIER_META[value];
              return (
                <label key={value} className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={filters.marginTiers.includes(value)}
                    onChange={(e) => toggleMarginTier(value, e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer flex-shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-1">
                      <span className="text-sm text-slate-700 group-hover:text-emerald-600">
                        {meta.label}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        ({marginTierCounts[value] ?? 0})
                      </span>
                    </span>
                    <span className="block text-xs text-gray-500">{meta.blurb}</span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="pt-3 border-t border-gray-100">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Max wait for my unit to sell
            </label>
            <input
              type="number"
              placeholder="e.g. 45 days"
              value={filters.maxWaitDays}
              onChange={(e) => onChange({ maxWaitDays: e.target.value })}
              className={numberInputClass}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[14, 30, 60, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => onChange({ maxWaitDays: String(d) })}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                    filters.maxWaitDays === String(d)
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-600 border-gray-300 hover:border-emerald-500 hover:text-emerald-600"
                  }`}
                >
                  &lt;{d}d
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Based on how fast it&apos;s selling and how many units are queued ahead of yours.
            </p>
          </div>
        </div>
      </Section>

      {/* Annualised return — the flat % scaled by turnover speed */}
      <Section
        title="Annualised Return"
        open={openSections.includes("Annualised Return")}
        onToggle={() => toggleSection("Annualised Return")}
      >
        <div className="space-y-3">
          <input
            type="number"
            placeholder="Min % per year"
            value={filters.minAnnualised}
            onChange={(e) => onChange({ minAnnualised: e.target.value })}
            className={numberInputClass}
          />
          <div className="flex flex-wrap gap-1.5">
            {[25, 50, 100, 200].map((pct) => (
              <button
                key={pct}
                onClick={() => onChange({ minAnnualised: String(pct) })}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  filters.minAnnualised === String(pct)
                    ? "bg-brand-navy border-brand-navy"
                    : "bg-white border-gray-300 hover:border-emerald-500"
                }`}
              >
                <Pct onDark={filters.minAnnualised === String(pct)}>{pct}%+</Pct>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            {annualisedBounds.max > 0 ? (
              <>
                Available range:{" "}
                <Pct className="font-normal">{annualisedBounds.min.toFixed(0)}%</Pct> –{" "}
                <Pct className="font-normal">{annualisedBounds.max.toFixed(0)}%</Pct> per year
              </>
            ) : (
              "No listing has enough sales history to annualise yet"
            )}
          </p>
          <p className="text-xs text-gray-500">
            The band % scaled by how long the wait is — the figure that reconciles the two, since a
            higher band also takes longer to pay out. 5% earned back in 30 days beats 15% in 300.
          </p>
        </div>
      </Section>

      {/* Investor price per unit */}
      <Section
        title="Investment per Unit"
        open={openSections.includes("Investment per Unit")}
        onToggle={() => toggleSection("Investment per Unit")}
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Min ₹"
              value={filters.minPrice}
              onChange={(e) => onChange({ minPrice: e.target.value })}
              className={numberInputClass}
            />
            <input
              type="number"
              placeholder="Max ₹"
              value={filters.maxPrice}
              onChange={(e) => onChange({ maxPrice: e.target.value })}
              className={numberInputClass}
            />
          </div>
          <p className="text-xs text-gray-500">
            Available range: ₹{priceBounds.min.toLocaleString("en-IN")} – ₹
            {priceBounds.max.toLocaleString("en-IN")}
          </p>
        </div>
      </Section>

      {/* Availability / funding momentum */}
      <Section
        title="Availability"
        open={openSections.includes("Availability")}
        onToggle={() => toggleSection("Availability")}
      >
        <div className="space-y-2">
          {AVAILABILITY_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-2 cursor-pointer group">
              <input
                type="radio"
                name="availability"
                checked={filters.availability === option.value}
                onChange={() => onChange({ availability: option.value })}
                className="mt-0.5 w-4 h-4 text-emerald-600 border-gray-300 focus:ring-emerald-500 cursor-pointer flex-shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm text-slate-700 group-hover:text-emerald-600">
                  {option.label}
                </span>
                <span className="block text-xs text-gray-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      {/* Minimum units left — investors wanting to place size need depth */}
      <Section
        title="Units Left"
        open={openSections.includes("Units Left")}
        onToggle={() => toggleSection("Units Left")}
      >
        <div className="space-y-3">
          <input
            type="number"
            placeholder="At least N units open"
            value={filters.minUnits}
            onChange={(e) => onChange({ minUnits: e.target.value })}
            className={numberInputClass}
          />
          <div className="flex flex-wrap gap-1.5">
            {[1, 5, 10, 25].map((n) => (
              <button
                key={n}
                onClick={() => onChange({ minUnits: String(n) })}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  filters.minUnits === String(n)
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-slate-600 border-gray-300 hover:border-emerald-500 hover:text-emerald-600"
                }`}
              >
                {n}+
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* Categories — flat list built from the investable products themselves */}
      {categoryOptions.length > 0 && (
        <Section
          title="Category"
          open={openSections.includes("Category")}
          onToggle={() => toggleSection("Category")}
        >
          <CheckList
            options={categoryOptions}
            selected={filters.categories}
            onToggle={toggleInList("categories")}
          />
        </Section>
      )}

      {tagOptions.length > 0 && (
        <Section
          title="Tags"
          last
          open={openSections.includes("Tags")}
          onToggle={() => toggleSection("Tags")}
        >
          <CheckList options={tagOptions} selected={filters.tags} onToggle={toggleInList("tags")} />
        </Section>
      )}
    </div>
  );

  return (
    <>
      {/* ── DESKTOP SIDEBAR (lg+) ── */}
      <aside className="hidden lg:block w-64 flex-shrink-0 bg-white border border-gray-200 rounded-xl shadow-sm self-start sticky top-20">
        <div className="overflow-y-auto max-h-[calc(100vh-6rem)]">{FilterContent}</div>
      </aside>

      {/* ── MOBILE FILTER BUTTON BAR (< lg) ── */}
      <div className="lg:hidden sticky top-16 z-30 -mx-4 px-4 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between py-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium active:bg-slate-700 transition-colors"
          >
            <FaFilter className="text-xs" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="ml-1 bg-emerald-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={onClear}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* ── MOBILE OVERLAY ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── MOBILE DRAWER ── */}
      <div
        className={`fixed top-0 left-0 h-full w-[300px] max-w-[85vw] bg-white z-[60] shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-slate-800 to-slate-900 flex-shrink-0">
          <span className="text-white font-bold text-lg flex items-center gap-2">
            <FaFilter className="text-emerald-400" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </span>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close filters"
            className="text-white p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          >
            <FaTimes size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">{FilterContent}</div>

        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-200 bg-slate-50">
          <button
            onClick={() => setMobileOpen(false)}
            className="w-full bg-slate-900 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-slate-800 transition-colors"
          >
            View Results
          </button>
        </div>
      </div>
    </>
  );
};
