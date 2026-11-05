"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FaChevronDown, FaChevronUp, FaChevronRight, FaTimes, FaFilter } from "react-icons/fa";
import type { ProductWithVariants } from "@/schemas";
import { useCategories } from "@/hooks/category";

// Category node type mirroring the API shape
interface CategoryNode {
  _id: string;
  name: string;
  slug: string;
  children?: CategoryNode[];
}

interface FilterSidebarProps {
  allProducts: ProductWithVariants[];
  selectedCategories: string[];
  selectedTags: string[];
  selectedFinishes: string[];
  selectedColors: string[];
  selectedSizes: string[];
  minPrice?: number;
  maxPrice?: number;
}

// ── Recursive category tree node ────────────────────────────────────────────
interface CategoryTreeNodeProps {
  node: CategoryNode;
  depth: number;
  productCounts: Map<string, number>;
  searchParams: URLSearchParams;
  onToggle: (slug: string, depth: number, checked: boolean) => void;
}

const CategoryTreeNode = ({
  node,
  depth,
  productCounts,
  searchParams,
  onToggle,
}: CategoryTreeNodeProps) => {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children && node.children.length > 0;

  // Figure out which URL param this depth maps to
  const paramName = depth === 0 ? 'category' : depth === 1 ? 'subcategory' : 'subsubcategory';
  const isChecked = searchParams.getAll(paramName).includes(node.slug);

  const count = productCounts.get(node.slug) ?? 0;

  return (
    <div style={{ marginLeft: depth > 0 ? `${depth * 12}px` : 0 }}>
      <div className="flex items-center justify-between py-1 group">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {/* Expand/collapse chevron — only when there are children */}
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-slate-400 hover:text-orange-500 transition-colors flex-shrink-0"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded
                ? <FaChevronDown className="w-2.5 h-2.5" />
                : <FaChevronRight className="w-2.5 h-2.5" />}
            </button>
          ) : (
            // Spacer so checkboxes align when siblings have/don't have children
            <span className="w-2.5 h-2.5 flex-shrink-0" />
          )}

          <label className="flex items-center gap-2 cursor-pointer min-w-0">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => onToggle(node.slug, depth, e.target.checked)}
              className="w-3.5 h-3.5 text-orange-500 border-gray-300 rounded focus:ring-orange-500 cursor-pointer flex-shrink-0"
            />
            <span className={`text-slate-700 group-hover:text-orange-500 truncate ${depth === 0 ? 'text-sm font-medium' : 'text-xs'
              }`}>
              {node.name}
            </span>
          </label>
        </div>
        <span className="text-xs text-gray-400 ml-1 flex-shrink-0">({count})</span>
      </div>

      {/* Children — rendered when expanded */}
      {hasChildren && expanded && (
        <div className="mt-0.5">
          {node.children!.map((child) => (
            <CategoryTreeNode
              key={child._id}
              node={child}
              depth={depth + 1}
              productCounts={productCounts}
              searchParams={searchParams}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────


export const FilterSidebar = ({
  allProducts,
  selectedCategories,
  selectedTags,
  selectedFinishes,
  selectedColors,
  selectedSizes,
  minPrice: initialMinPrice,
  maxPrice: initialMaxPrice,
}: FilterSidebarProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Fetch main categories from API (same as navbar)
  const { categories: dbCategories } = useCategories(false); // Only active categories

  const [isLoading, setIsLoading] = useState(false);
  const prevSearchParams = useRef(searchParams.toString());

  // Reset loading when navigation completes (searchParams change)
  useEffect(() => {
    const current = searchParams.toString();
    if (current !== prevSearchParams.current) {
      prevSearchParams.current = current;
      setIsLoading(false);
    }
  }, [searchParams]);

  const [openSections, setOpenSections] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState({
    min: initialMinPrice?.toString() || "",
    max: initialMaxPrice?.toString() || "",
  });

  // Generate filter options dynamically from products
  const filterOptions = useMemo(() => {
    const finishes = new Map<string, number>();
    const colors = new Map<string, number>();
    const sizes = new Map<string, number>();
    const tags = new Map<string, number>();

    // Predefined tags
    const predefinedTags = ['popular', 'trending', 'new', 'premium', 'exclusive', 'classic', 'bestseller', 'limited'];

    // Helper function to get all descendant category slugs (including the parent)
    const getAllCategorySlugs = (category: any): string[] => {
      const slugs = [category.slug];
      if (category.children && category.children.length > 0) {
        category.children.forEach((child: any) => {
          slugs.push(...getAllCategorySlugs(child));
        });
      }
      return slugs;
    };

    // Build a map of main category slug -> all related slugs (including subcategories)
    const categorySlugMap = new Map<string, string[]>();
    dbCategories.forEach(category => {
      const allSlugs = getAllCategorySlugs(category);
      categorySlugMap.set(category.slug, allSlugs);
    });

    // Count products for each main category (including subcategories)
    const categoryCounts = new Map<string, number>();

    allProducts.forEach(product => {
      const productCategorySlug = product.category || '';

      // Check which main category this product belongs to
      if (productCategorySlug) {
        categorySlugMap.forEach((slugs, mainCategorySlug) => {
          if (slugs.includes(productCategorySlug)) {
            categoryCounts.set(mainCategorySlug, (categoryCounts.get(mainCategorySlug) || 0) + 1);
          }
        });
      }

      // Count tags
      if (product.tags && Array.isArray(product.tags)) {
        product.tags.forEach((tag: string) => {
          if (predefinedTags.includes(tag.toLowerCase())) {
            tags.set(tag.toLowerCase(), (tags.get(tag.toLowerCase()) || 0) + 1);
          }
        });
      }

      // Count finishes from base product
      if (product.finish) {
        finishes.set(product.finish, (finishes.get(product.finish) || 0) + 1);
      }

      // Count colors from base product
      if (product.color) {
        colors.set(product.color, (colors.get(product.color) || 0) + 1);
      }

      // Count size from base product (for products that store size as a top-level string)
      const productSize = (product as any).size;
      if (productSize) {
        sizes.set(productSize, (sizes.get(productSize) || 0) + 1);
      }

      // Extract finishes, colors, and sizes from variants (may overlap with base product — Maps deduplicate)
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach((variant: any) => {
          // Variant finishes
          if (variant.finish) {
            finishes.set(variant.finish, (finishes.get(variant.finish) || 0) + 1);
          }

          // Variant colors
          if (variant.color) {
            colors.set(variant.color, (colors.get(variant.color) || 0) + 1);
          }

          // Variant sizes
          if (variant.size && variant.size !== productSize) {
            sizes.set(variant.size, (sizes.get(variant.size) || 0) + 1);
          }
          if (variant.sizes && Array.isArray(variant.sizes)) {
            variant.sizes.forEach((size: string) => {
              if (size && size !== productSize) {
                sizes.set(size, (sizes.get(size) || 0) + 1);
              }
            });
          }
        });
      }
    });

    // Ensure all predefined tags are in the list (even with 0 count)
    predefinedTags.forEach(tag => {
      if (!tags.has(tag)) {
        tags.set(tag, 0);
      }
    });

    // Use categories from API and add product counts (including subcategories)
    const categoriesWithCounts = dbCategories.map(category => ({
      label: category.name,
      value: category.slug,
      count: categoryCounts.get(category.slug) || 0,
    }));

    return {
      categories: categoriesWithCounts,
      tags: Array.from(tags.entries()).map(([value, count]) => ({
        label: value.charAt(0).toUpperCase() + value.slice(1),
        value,
        count,
      })),
      finishes: Array.from(finishes.entries()).map(([value, count]) => ({
        label: value.charAt(0).toUpperCase() + value.slice(1),
        value,
        count,
      })),
      colors: Array.from(colors.entries()).map(([value, count]) => ({
        label: value.charAt(0).toUpperCase() + value.slice(1),
        value,
        count,
      })),
      sizes: Array.from(sizes.entries()).map(([value, count]) => ({
        label: value,
        value,
        count,
      })),
    };
  }, [allProducts, dbCategories]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) =>
      prev.includes(title)
        ? prev.filter((section) => section !== title)
        : [...prev, title]
    );
  };

  // Maps a category slug at a given depth to the correct URL param name
  const depthToParam = (depth: number) =>
    depth === 0 ? 'category' : depth === 1 ? 'subcategory' : 'subsubcategory';

  const updateFilters = (filterType: string, value: string, checked: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    const currentValues = params.getAll(filterType);

    if (checked) {
      params.append(filterType, value);
    } else {
      params.delete(filterType);
      currentValues
        .filter(v => v !== value)
        .forEach(v => params.append(filterType, v));
    }

    setIsLoading(true);
    router.push(`/search?${params.toString()}`);
  };

  // Handler for category tree node toggles — uses depth-based param name
  const handleCategoryToggle = (slug: string, depth: number, checked: boolean) => {
    updateFilters(depthToParam(depth), slug, checked); // setIsLoading is called inside updateFilters
  };

  const applyPriceFilter = () => {
    const params = new URLSearchParams(searchParams.toString());

    if (priceRange.min) {
      params.set('minPrice', priceRange.min);
    } else {
      params.delete('minPrice');
    }

    if (priceRange.max) {
      params.set('maxPrice', priceRange.max);
    } else {
      params.delete('maxPrice');
    }

    setIsLoading(true);
    router.push(`/search?${params.toString()}`);
  };

  const clearAllFilters = () => {
    setPriceRange({ min: "", max: "" });
    setIsLoading(true);
    router.push('/search');
  };

  // Mobile drawer
  const [mobileOpen, setMobileOpen] = useState(false);

  // Count active filters for the mobile button badge
  const activeFilterCount = [
    ...selectedCategories,
    ...(searchParams.getAll('subcategory')),
    ...(searchParams.getAll('subsubcategory')),
    ...selectedTags,
    ...selectedFinishes,
    ...selectedColors,
    ...selectedSizes,
    ...(initialMinPrice !== undefined ? ['minPrice'] : []),
    ...(initialMaxPrice !== undefined ? ['maxPrice'] : []),
  ].length;

  // ── The actual filter panels (shared between sidebar & drawer) ──────────────
  const FilterContent = () => (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800">Filters</h2>
        <button
          onClick={clearAllFilters}
          className="text-sm text-orange-500 hover:text-orange-600 font-medium"
        >
          Clear All
        </button>
      </div>

      {/* Price Range */}
      <div className="mb-6 pb-6 border-b border-gray-200">
        <button
          onClick={() => toggleSection("Price Range")}
          className="flex items-center justify-between w-full mb-3"
        >
          <h3 className="font-semibold text-slate-800">Price Range</h3>
          {openSections.includes("Price Range") ? (
            <FaChevronUp className="text-slate-600 text-sm" />
          ) : (
            <FaChevronDown className="text-slate-600 text-sm" />
          )}
        </button>
        {openSections.includes("Price Range") && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Min"
                value={priceRange.min}
                onChange={(e) => setPriceRange({ ...priceRange, min: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <input
                type="number"
                placeholder="Max"
                value={priceRange.max}
                onChange={(e) => setPriceRange({ ...priceRange, max: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <button
              onClick={applyPriceFilter}
              className="w-full bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Categories Filter — recursive tree */}
      {dbCategories.length > 0 && (
        <div className="mb-6 pb-6 border-b border-gray-200">
          <button
            onClick={() => toggleSection("Categories")}
            className="flex items-center justify-between w-full mb-3"
          >
            <h3 className="font-semibold text-slate-800">Categories</h3>
            {openSections.includes("Categories") ? (
              <FaChevronUp className="text-slate-600 text-sm" />
            ) : (
              <FaChevronDown className="text-slate-600 text-sm" />
            )}
          </button>
          {openSections.includes("Categories") && (
            <div className="space-y-0.5 max-h-80 overflow-y-auto pr-1">
              {dbCategories.map((cat) => (
                <CategoryTreeNode
                  key={(cat as unknown as CategoryNode)._id}
                  node={cat as unknown as CategoryNode}
                  depth={0}
                  productCounts={(() => {
                    // Build product count map for all slugs recursively
                    const countMap = new Map<string, number>();
                    const getAllSlugs = (c: CategoryNode): string[] => [
                      c.slug,
                      ...(c.children?.flatMap(getAllSlugs) ?? []),
                    ];
                    allProducts.forEach(p => {
                      const ps = p.category || '';
                      if (!ps) return;
                      // Walk every node visible in this tree branch
                      const walk = (node: CategoryNode) => {
                        const allSlugs = getAllSlugs(node);
                        if (allSlugs.includes(ps)) {
                          countMap.set(node.slug, (countMap.get(node.slug) || 0) + 1);
                        }
                        node.children?.forEach(walk);
                      };
                      walk(cat as unknown as CategoryNode);
                    });
                    return countMap;
                  })()}
                  searchParams={new URLSearchParams(searchParams.toString())}
                  onToggle={handleCategoryToggle}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tags Filter */}
      {filterOptions.tags.length > 0 && (
        <div className="mb-6 pb-6 border-b border-gray-200">
          <button
            onClick={() => toggleSection("Tags")}
            className="flex items-center justify-between w-full mb-3"
          >
            <h3 className="font-semibold text-slate-800">Tags</h3>
            {openSections.includes("Tags") ? (
              <FaChevronUp className="text-slate-600 text-sm" />
            ) : (
              <FaChevronDown className="text-slate-600 text-sm" />
            )}
          </button>
          {openSections.includes("Tags") && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filterOptions.tags.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(option.value)}
                      onChange={(e) => updateFilters('tags', option.value, e.target.checked)}
                      className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 cursor-pointer"
                    />
                    <span className="text-sm text-slate-700 group-hover:text-orange-500">
                      {option.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">({option.count})</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Finish Filter */}
      {filterOptions.finishes.length > 0 && (
        <div className="mb-6 pb-6 border-b border-gray-200">
          <button
            onClick={() => toggleSection("Finish Type")}
            className="flex items-center justify-between w-full mb-3"
          >
            <h3 className="font-semibold text-slate-800">Finish Type</h3>
            {openSections.includes("Finish Type") ? (
              <FaChevronUp className="text-slate-600 text-sm" />
            ) : (
              <FaChevronDown className="text-slate-600 text-sm" />
            )}
          </button>
          {openSections.includes("Finish Type") && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filterOptions.finishes.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedFinishes.includes(option.value)}
                      onChange={(e) => updateFilters('finish', option.value, e.target.checked)}
                      className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 cursor-pointer"
                    />
                    <span className="text-sm text-slate-700 group-hover:text-orange-500">
                      {option.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">({option.count})</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Color Filter */}
      {filterOptions.colors.length > 0 && (
        <div className="mb-6 pb-6 border-b border-gray-200">
          <button
            onClick={() => toggleSection("Color")}
            className="flex items-center justify-between w-full mb-3"
          >
            <h3 className="font-semibold text-slate-800">Color</h3>
            {openSections.includes("Color") ? (
              <FaChevronUp className="text-slate-600 text-sm" />
            ) : (
              <FaChevronDown className="text-slate-600 text-sm" />
            )}
          </button>
          {openSections.includes("Color") && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filterOptions.colors.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedColors.includes(option.value)}
                      onChange={(e) => updateFilters('color', option.value, e.target.checked)}
                      className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 cursor-pointer"
                    />
                    <span className="text-sm text-slate-700 group-hover:text-orange-500">
                      {option.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">({option.count})</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Size Filter */}
      {filterOptions.sizes.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => toggleSection("Size")}
            className="flex items-center justify-between w-full mb-3"
          >
            <h3 className="font-semibold text-slate-800">Size</h3>
            {openSections.includes("Size") ? (
              <FaChevronUp className="text-slate-600 text-sm" />
            ) : (
              <FaChevronDown className="text-slate-600 text-sm" />
            )}
          </button>
          {openSections.includes("Size") && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filterOptions.sizes.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedSizes.includes(option.value)}
                      onChange={(e) => updateFilters('size', option.value, e.target.checked)}
                      className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 cursor-pointer"
                    />
                    <span className="text-sm text-slate-700 group-hover:text-orange-500">
                      {option.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">({option.count})</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── LOADING OVERLAY ── */}
      {isLoading && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* Covers only the right/content area visually */}
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 bg-white rounded-xl shadow-lg px-8 py-6 pointer-events-auto">
              <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-slate-700">Applying filters…</span>
            </div>
          </div>
        </div>
      )}

      {/* ── DESKTOP SIDEBAR (lg+) ── */}
      <aside className="hidden lg:block w-64 flex-shrink-0 bg-white border-r border-gray-200 self-start sticky top-4">
        <div className="overflow-y-auto max-h-[calc(100vh-6rem)]">
          <FilterContent />
        </div>
      </aside>

      {/* ── MOBILE FILTER BUTTON BAR (< lg) ── */}
      <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium active:bg-slate-700 transition-colors"
          >
            <FaFilter className="text-xs" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="ml-1 bg-orange-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-sm text-orange-500 hover:text-orange-600 font-medium"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* ── MOBILE OVERLAY ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── MOBILE DRAWER ── */}
      <div
        className={`fixed top-0 left-0 h-full w-[300px] max-w-[85vw] bg-white z-50 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-slate-800 to-slate-900 flex-shrink-0">
          <span className="text-white font-bold text-lg flex items-center gap-2">
            <FaFilter className="text-orange-400" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
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

        {/* Scrollable filter content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <FilterContent />
        </div>

        {/* Drawer footer — apply/close */}
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
