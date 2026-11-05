"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { HiTrendingUp } from "react-icons/hi";
import { FaTh, FaBars } from "react-icons/fa";
import { FiChevronLeft, FiChevronRight, FiSearch, FiX } from "react-icons/fi";
import { ProductItem } from "@/components/products/ProductItem";
import {
  InvestorFilterSidebar,
  DEFAULT_INVESTOR_FILTERS,
  countActiveFilters,
  type InvestorFilters,
  type FilterOption,
} from "@/components/investor/InvestorFilterSidebar";
import { useInvestableProducts } from "@/hooks/investment";
import { deriveInvestorMetrics, formatWait, type InvestorMetrics } from "@/lib/investor/metrics";
import { StatTile } from "@/components/investor/InvestorCharts";
import { useInvestorCartStore } from "@/stores/investorCartStore";
import { pageWindow } from "@/utils/pagination";

// Maps the raw backend product doc (from GET /investor/products) into the
// shape ProductItem expects (see src/app/actions.ts's transformProduct,
// which does the same mapping for the customer storefront — duplicated
// here rather than imported since that file is a "use server" action file
// and its helper isn't exported/importable from client code).
function mapToProductItemShape(p: any) {
  const featured = p.images?.find((img: any) => img.isFeatured) || p.images?.[0];
  return {
    id: p._id,
    name: p.name,
    img: featured?.url,
    price: p.price ?? 0,
    cuttedPrice: p.cuttedPrice,
    category: p.category?.slug || p.category?._id || p.category,
    variants: p.variants || [],
    tags: p.tags,
    shortDescription: p.shortDescription,
    // Drives the out-of-stock state on the card — a product with no stock
    // can't be funded no matter how many investable units are left.
    stock: p.stock,
  };
}

// "Return: High to Low" was removed under Phase 10, when every listing returned
// exactly the platform margin and the sort was a no-op. Phase 20 gave each
// product its own bands, so return rate discriminates again and it is back —
// but annualised stays the default, because a higher band is also a longer wait.
const SORT_OPTIONS = [
  { label: "Best Annualised Return", value: "annualised-desc" },
  { label: "Return: High to Low", value: "roi-desc" },
  { label: "Fastest to Sell", value: "wait-asc" },
  { label: "Selling Fastest (units/wk)", value: "velocity-desc" },
  { label: "Shortest Queue", value: "queue-asc" },
  { label: "Featured", value: "featured" },
  { label: "Investment: Low to High", value: "price-asc" },
  { label: "Investment: High to Low", value: "price-desc" },
  { label: "Payout: High to Low", value: "payout-desc" },
  { label: "Most Invested", value: "invested-desc" },
  { label: "Least Invested", value: "invested-asc" },
  { label: "Almost Fully Funded", value: "funding-desc" },
  { label: "Most Units Available", value: "units-desc" },
  { label: "Newest First", value: "newest" },
];

const PER_PAGE_OPTIONS = [6, 12, 24, 48];

// Per-product metrics come from lib/investor/metrics.ts so the cards, the
// filters and the sort comparators can't drift apart.
type EnrichedProduct = InvestorMetrics;

export default function InvestorProductsPage() {
  const { products, isLoading } = useInvestableProducts();
  const addItem = useInvestorCartStore((s) => s.addItem);

  const [filters, setFilters] = useState<InvestorFilters>(DEFAULT_INVESTOR_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState("featured");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [perPage, setPerPage] = useState(12);
  const [page, setPage] = useState(1);

  const patchFilters = (patch: Partial<InvestorFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const enriched = useMemo<EnrichedProduct[]>(
    () => products.map(deriveInvestorMetrics),
    [products]
  );

  // Filter option lists + numeric bounds, built from what's actually listed.
  const { categoryOptions, tagOptions, priceBounds, annualisedBounds, marginTierCounts } = useMemo(() => {
    const categories = new Map<string, FilterOption>();
    const tags = new Map<string, number>();

    for (const item of enriched) {
      if (item.categorySlug) {
        const existing = categories.get(item.categorySlug);
        categories.set(item.categorySlug, {
          value: item.categorySlug,
          label: item.raw.category?.name || item.categorySlug,
          count: (existing?.count ?? 0) + 1,
        });
      }
      for (const tag of item.tags) {
        const key = tag.toLowerCase();
        tags.set(key, (tags.get(key) ?? 0) + 1);
      }
    }

    const prices = enriched.map((i) => i.investorPrice);
    // Only listings with enough sales history have an annualised figure.
    const annualised = enriched
      .map((i) => i.annualisedReturn)
      .filter((n): n is number => n !== null);

    const tiers: Record<string, number> = {};
    for (const item of enriched) {
      tiers[item.marginTier] = (tiers[item.marginTier] ?? 0) + 1;
    }

    return {
      categoryOptions: Array.from(categories.values()).sort((a, b) =>
        a.label.localeCompare(b.label)
      ),
      tagOptions: Array.from(tags.entries())
        .map(([value, count]) => ({
          value,
          label: value.charAt(0).toUpperCase() + value.slice(1),
          count,
        }))
        .sort((a, b) => b.count - a.count),
      priceBounds: {
        min: prices.length ? Math.min(...prices) : 0,
        max: prices.length ? Math.max(...prices) : 0,
      },
      annualisedBounds: {
        min: annualised.length ? Math.min(...annualised) : 0,
        max: annualised.length ? Math.max(...annualised) : 0,
      },
      marginTierCounts: tiers,
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    const query = searchInput.trim().toLowerCase();
    const minPrice = filters.minPrice === "" ? null : Number(filters.minPrice);
    const maxPrice = filters.maxPrice === "" ? null : Number(filters.maxPrice);
    const minAnnualised = filters.minAnnualised === "" ? null : Number(filters.minAnnualised);
    const maxWaitDays = filters.maxWaitDays === "" ? null : Number(filters.maxWaitDays);
    const minUnits = filters.minUnits === "" ? null : Number(filters.minUnits);

    return enriched.filter((item) => {
      if (query) {
        const haystack = [
          item.raw.name,
          item.raw.shortDescription,
          item.raw.description,
          item.raw.category?.name,
          ...item.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (filters.categories.length > 0 && !filters.categories.includes(item.categorySlug)) {
        return false;
      }

      if (
        filters.tags.length > 0 &&
        !filters.tags.some((t) => item.tags.map((x) => x.toLowerCase()).includes(t))
      ) {
        return false;
      }

      if (minPrice !== null && item.investorPrice < minPrice) return false;
      if (maxPrice !== null && item.investorPrice > maxPrice) return false;
      if (filters.marginTiers.length > 0 && !filters.marginTiers.includes(item.marginTier)) {
        return false;
      }

      // A listing with no sales history has no annualised figure and no wait
      // estimate. Filtering on either excludes it rather than treating the
      // missing value as zero — "unknown" is not "bad", but it isn't a match.
      if (minAnnualised !== null) {
        if (item.annualisedReturn === null || item.annualisedReturn < minAnnualised) return false;
      }
      if (maxWaitDays !== null) {
        if (item.estDaysToSale === null || item.estDaysToSale > maxWaitDays) return false;
      }
      if (minUnits !== null && item.remainingUnits < minUnits) return false;

      if (filters.availability === "available" && item.remainingUnits <= 0) return false;
      if (filters.availability === "funded" && item.remainingUnits > 0) return false;
      if (
        filters.availability === "filling" &&
        !(item.remainingUnits > 0 && item.fundingPct >= 50)
      ) {
        return false;
      }

      return true;
    });
  }, [enriched, filters, searchInput]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    // Listings with no estimate sort to the bottom of every speed-based sort
    // rather than to the top by accident.
    const lastIfNull = (n: number | null, dir: "asc" | "desc") =>
      n === null ? (dir === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : n;

    switch (sortBy) {
      case "annualised-desc":
        return copy.sort(
          (a, b) => lastIfNull(b.annualisedReturn, "desc") - lastIfNull(a.annualisedReturn, "desc")
        );
      // The band percentage itself — the headline return, ignoring how long it
      // takes to arrive.
      case "roi-desc":
        return copy.sort((a, b) => b.roi - a.roi);
      case "wait-asc":
        return copy.sort(
          (a, b) => lastIfNull(a.estDaysToSale, "asc") - lastIfNull(b.estDaysToSale, "asc")
        );
      case "velocity-desc":
        return copy.sort((a, b) => b.velocityPerWeek - a.velocityPerWeek);
      case "queue-asc":
        return copy.sort((a, b) => a.queueAhead - b.queueAhead);
      case "price-asc":
        return copy.sort((a, b) => a.investorPrice - b.investorPrice);
      case "price-desc":
        return copy.sort((a, b) => b.investorPrice - a.investorPrice);
      case "payout-desc":
        return copy.sort((a, b) => b.investorPayout - a.investorPayout);
      case "invested-desc":
        return copy.sort((a, b) => b.investedUnits - a.investedUnits);
      case "invested-asc":
        return copy.sort((a, b) => a.investedUnits - b.investedUnits);
      case "funding-desc":
        return copy.sort((a, b) => b.fundingPct - a.fundingPct);
      case "units-desc":
        return copy.sort((a, b) => b.remainingUnits - a.remainingUnits);
      case "newest":
        return copy.sort((a, b) => b.createdAt - a.createdAt);
      case "featured":
      default:
        return copy;
    }
  }, [filtered, sortBy]);

  // Any change to the result set should drop the investor back to page 1.
  useEffect(() => setPage(1), [filters, searchInput, sortBy, perPage]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  // Clamp rather than reset, so a shrinking result set never shows a blank page.
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * perPage;
  const paged = sorted.slice(startIndex, startIndex + perPage);

  // Headline stats across the *filtered* set — what the current view is worth.
  //
  // Return rate varies by listing again (Phase 20: each product's bands decide
  // what an investor earns), but annualised is still the figure that ranks
  // them, because a higher band also means a longer wait to be paid it.
  const summary = useMemo(() => {
    const unitsOpen = filtered.reduce((sum, i) => sum + i.remainingUnits, 0);
    const capitalToFillAll = filtered.reduce(
      (sum, i) => sum + i.investorPrice * i.remainingUnits,
      0
    );

    const annualised = filtered
      .map((i) => i.annualisedReturn)
      .filter((n): n is number => n !== null);
    const bestAnnualised = annualised.length ? Math.max(...annualised) : null;

    const waits = filtered
      .map((i) => i.estDaysToSale)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    const medianWait = waits.length ? waits[Math.floor(waits.length / 2)] : null;

    const highMarginCount = filtered.filter((i) => i.marginTier === "high").length;

    return { unitsOpen, capitalToFillAll, bestAnnualised, medianWait, highMarginCount };
  }, [filtered]);

  const handleAddToCart = (item: EnrichedProduct, quantity: number) => {
    if (item.remainingUnits <= 0) {
      toast.error(`${item.raw.name} has no units left to invest in right now`);
      return;
    }
    addItem(
      {
        productId: item.raw._id,
        name: item.raw.name,
        img:
          item.raw.images?.find((img: any) => img.isFeatured)?.url || item.raw.images?.[0]?.url,
        investorPrice: item.investorPrice,
        maxQuantity: item.remainingUnits,
      },
      quantity
    );
    toast.success(
      `Added ${quantity} unit${quantity > 1 ? "s" : ""} of ${item.raw.name} to your invest cart`
    );
  };

  const activeFilterCount = countActiveFilters(filters);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Nothing is listed at all — no point showing filters over an empty set.
  if (enriched.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-slate-200 text-center py-20">
        <HiTrendingUp className="w-20 h-20 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-900 mb-2">
          No products open for investment right now
        </h3>
        <p className="text-slate-600">
          Check back soon — admin opens new products for investment regularly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header. The cart button that used to sit here is gone — the
          investor nav carries it on every page now, with the same badge. */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Invest in Products</h1>
        <p className="text-slate-600 mt-1">
          Fund a unit of stock and get your payout back when it sells. You never receive the
          product — this is investment only.
        </p>
      </div>

      {/* Summary strip for the current filtered view */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile
          label="Listings"
          value={filtered.length.toLocaleString("en-IN")}
          sub={`${summary.unitsOpen.toLocaleString("en-IN")} units open`}
        />
        <StatTile
          label="Best Annualised"
          value={summary.bestAnnualised !== null ? `${summary.bestAnnualised.toFixed(0)}%/yr` : "—"}
          isPercent
          sub="Return adjusted for speed"
          hint="What a listing's current band pays, scaled by how fast the capital comes back. A higher band pays more but takes longer to pay it."
          emphasis
        />
        <StatTile
          label="Typical Wait"
          value={formatWait(summary.medianWait)}
          sub="Median across this view"
          hint="Median estimated time for a newly funded unit to sell."
        />
        <StatTile
          label="High Margin"
          value={summary.highMarginCount.toLocaleString("en-IN")}
          sub="Biggest return, slowest to sell"
          hint="High margin is the best-paying band, reached by taking longest to sell. Each product has its own day thresholds and percentages, set by admin."
        />
        <StatTile
          label="To Fund Everything"
          value={`₹${Math.round(summary.capitalToFillAll).toLocaleString("en-IN")}`}
          sub="All open units in this view"
          hint="What it would cost to take every remaining unit shown."
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <InvestorFilterSidebar
          filters={filters}
          onChange={patchFilters}
          onClear={() => setFilters(DEFAULT_INVESTOR_FILTERS)}
          categoryOptions={categoryOptions}
          tagOptions={tagOptions}
          priceBounds={priceBounds}
          annualisedBounds={annualisedBounds}
          marginTierCounts={marginTierCounts}
        />

        <div className="flex-1 min-w-0">
          {/* Search box — filters as you type, nothing to submit */}
          <div className="mb-6 relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products open for investment..."
              className="w-full pl-12 pr-12 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white shadow-sm"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                title="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition-colors"
              >
                <FiX className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>

          {/* Result count + controls */}
          <div className="flex flex-col gap-4 mb-6">
            <p className="text-sm text-slate-600">
              {sorted.length > 0 ? (
                <>
                  Showing {startIndex + 1}-{startIndex + paged.length} of {sorted.length}{" "}
                  {sorted.length === 1 ? "listing" : "listings"}
                </>
              ) : (
                "No listings match your filters"
              )}
              {activeFilterCount > 0 && (
                <>
                  {" · "}
                  <button
                    onClick={() => setFilters(DEFAULT_INVESTOR_FILTERS)}
                    className="text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
                  </button>
                </>
              )}
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 font-medium whitespace-nowrap">Show:</span>
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
                  {PER_PAGE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      onClick={() => setPerPage(option)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                        perPage === option
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label htmlFor="sort" className="text-sm text-slate-600 whitespace-nowrap">
                    Sort by:
                  </label>
                  <select
                    id="sort"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="hidden sm:flex items-center gap-1 border border-gray-300 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode("grid")}
                    title="Grid View"
                    className={`p-2 rounded ${
                      viewMode === "grid"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-600 hover:bg-gray-100"
                    }`}
                  >
                    <FaTh size={14} />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    title="List View"
                    className={`p-2 rounded ${
                      viewMode === "list"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-600 hover:bg-gray-100"
                    }`}
                  >
                    <FaBars size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          {paged.length > 0 ? (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6"
                  : "flex flex-col gap-4"
              }
            >
              {paged.map((item) => (
                <ProductItem
                  key={item.raw._id}
                  product={mapToProductItemShape(item.raw)}
                  variant="investor"
                  investorPrice={item.investorPrice}
                  investorPayout={item.investorPayout}
                  remainingUnits={item.remainingUnits}
                  investedUnits={item.investedUnits}
                  investableUnits={item.investableUnits}
                  analytics={item}
                  onAddToInvestCart={(quantity) => handleAddToCart(item, quantity)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-slate-800 mb-2">No listings found</h3>
              <p className="text-slate-600 mb-4">
                Try raising the max wait, lowering the minimum annualised return, or including
                listings with no sales history yet.
              </p>
              <button
                onClick={() => {
                  setFilters(DEFAULT_INVESTOR_FILTERS);
                  setSearchInput("");
                }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
              >
                Reset filters
              </button>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-12">
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                >
                  <FiChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Previous</span>
                </button>

                <div className="flex items-center gap-1">
                  {pageWindow(currentPage, totalPages).map((p, idx) =>
                    p === "..." ? (
                      <span key={`gap-${idx}`} className="px-2 text-slate-400">
                        ...
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`min-w-[40px] h-10 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                          currentPage === p
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>

                <button
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                >
                  <span className="hidden sm:inline">Next</span>
                  <FiChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="text-center text-sm text-slate-500 mt-4">
                Page {currentPage} of {totalPages}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
