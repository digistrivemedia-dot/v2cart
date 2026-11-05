/**
 * Client-side filtering + sorting for the search screen.
 *
 * Why client-side: the backend's SearchFeatures handles `keyword` and simple
 * equality/price operators, but not multi-select facets (three colours OR'd
 * together) and has no sort parameter at all. Fetching the keyword match and
 * refining it here gives the web's filter behaviour without inventing new
 * endpoints — and keeps every filter tap instant instead of a round trip.
 *
 * Pure functions, no React, so the behaviour is testable.
 */

export const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest first' },
];

/**
 * The tags the web sidebar always offers, in its order — so the sheet shows
 * the full set even before any product carries one. Deriving this list from
 * the results instead would hide every tag until a product used it.
 */
export const PREDEFINED_TAGS = [
  'popular',
  'trending',
  'new',
  'premium',
  'exclusive',
  'classic',
  'bestseller',
  'limited',
];

/** The "nothing selected" state. Lives here, with the logic that reads it. */
export const EMPTY_FILTERS = {
  categories: [],
  subcategories: [],
  colors: [],
  sizes: [],
  finishes: [],
  tags: [],
  minPrice: '',
  maxPrice: '',
  sort: 'relevance',
};

const FACET_GROUPS = ['categories', 'subcategories', 'colors', 'sizes', 'finishes', 'tags'];

export function countActiveFilters(f) {
  return (
    FACET_GROUPS.reduce((n, group) => n + (f[group]?.length || 0), 0) +
    (f.minPrice ? 1 : 0) +
    (f.maxPrice ? 1 : 0) +
    (f.sort !== 'relevance' ? 1 : 0)
  );
}

const lower = (v) => String(v ?? '').toLowerCase();

/** Case-insensitive membership; the facets store raw values. */
const matches = (selected, values) =>
  selected.length === 0 || selected.some((s) => values.some((v) => lower(s) === lower(v)));

/**
 * Every value a product offers for one attribute, including its variants.
 *
 * A product whose only blue option lives on a variant still *is* available in
 * blue, so filtering on the top-level field alone hides real matches — which
 * is why the web sidebar counts variants too.
 */
function attributeValues(product, key) {
  const values = [];
  if (product?.[key]) values.push(product[key]);

  for (const variant of product?.variants || []) {
    if (variant?.[key]) values.push(variant[key]);
    // `sizes` is an array on some variants and `size` a string on others.
    if (key === 'size' && Array.isArray(variant.sizes)) values.push(...variant.sizes);
  }

  return values;
}

/** Products reference category/subcategory as a populated doc or a bare id. */
const refSlug = (ref) => (ref && (ref.slug || ref._id)) || ref || '';

export function applyFilters(products = [], filters) {
  const min = filters.minPrice === '' ? null : Number(filters.minPrice);
  const max = filters.maxPrice === '' ? null : Number(filters.maxPrice);
  const subcategories = filters.subcategories || [];

  return products.filter((p) => {
    const price = Number(p.price) || 0;
    if (min !== null && price < min) return false;
    if (max !== null && price > max) return false;

    if (!matches(filters.colors, attributeValues(p, 'color'))) return false;
    if (!matches(filters.sizes, attributeValues(p, 'size'))) return false;
    if (!matches(filters.finishes, attributeValues(p, 'finish'))) return false;

    if (filters.categories.length > 0) {
      const slug = refSlug(p.category);
      if (!filters.categories.some((c) => String(c) === String(slug))) return false;
    }

    if (subcategories.length > 0) {
      const slug = refSlug(p.subcategory);
      if (!subcategories.some((c) => String(c) === String(slug))) return false;
    }

    if (filters.tags.length > 0) {
      const tags = (p.tags || []).map(lower);
      // OR within tags: picking two tags widens, it doesn't narrow to both.
      if (!filters.tags.some((t) => tags.includes(lower(t)))) return false;
    }

    return true;
  });
}

export function applySort(products = [], sort) {
  const copy = [...products];
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    case 'price-desc':
      return copy.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    case 'rating':
      return copy.sort((a, b) => (Number(b.ratings) || 0) - (Number(a.ratings) || 0));
    case 'newest':
      return copy.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    case 'relevance':
    default:
      return copy;
  }
}

/**
 * Facet options and counts, built from the result set — so the sheet can
 * never offer a filter that matches nothing.
 *
 * Colour/size/finish include variant values, matching both the web sidebar
 * and `applyFilters` above. If these two disagreed, the sheet would offer an
 * option that filters to an empty grid.
 */
export function buildFacets(products = []) {
  const tally = (key) => {
    // Keyed case-insensitively because `applyFilters` matches that way. Keyed
    // by raw string instead, 'White' and 'white' would show as two options
    // whose counts both under-report what selecting either actually returns.
    const seen = new Map();
    for (const p of products) {
      // One product counts once per distinct value, however many variants
      // repeat it — otherwise "Blue (7)" on a 3-product result set.
      for (const value of new Set(attributeValues(p, key).map(lower))) {
        const existing = seen.get(value);
        seen.set(value, {
          // First spelling seen wins as the label, so the UI shows 'White'
          // rather than a lowercased 'white'.
          value: existing?.value ?? attributeValues(p, key).find((v) => lower(v) === value),
          count: (existing?.count || 0) + 1,
        });
      }
    }
    return [...seen.values()].map(({ value, count }) => ({ value: String(value), count }));
  };

  const tags = new Map();
  for (const p of products) {
    for (const t of p.tags || []) {
      const k = lower(t);
      tags.set(k, (tags.get(k) || 0) + 1);
    }
  }

  const byRef = (key) => {
    const found = new Map();
    for (const p of products) {
      const ref = p[key];
      if (!ref) continue;
      const slug = String(refSlug(ref));
      const existing = found.get(slug);
      found.set(slug, {
        value: slug,
        label: ref.name || existing?.label || slug,
        count: (existing?.count || 0) + 1,
      });
    }
    return [...found.values()];
  };

  return {
    categories: byRef('category'),
    subcategories: byRef('subcategory'),
    colors: tally('color'),
    sizes: tally('size'),
    finishes: tally('finish'),
    // Always the full predefined set, in the web's order, with live counts.
    tags: PREDEFINED_TAGS.map((value) => ({ value, count: tags.get(value) || 0 })),
  };
}

/**
 * The category tree as filter options: every category the store has, with a
 * count from the current results.
 *
 * Built from the categories API rather than from the results, so a category
 * with nothing in it is still visible (greyed by its `0`) exactly as on the
 * web sidebar — the list of what the store sells shouldn't shrink because of
 * the current search.
 */
export function buildCategoryOptions(tree = [], products = []) {
  const counts = new Map();
  for (const p of products) {
    for (const key of ['category', 'subcategory']) {
      const slug = String(refSlug(p[key]));
      if (slug) counts.set(slug, (counts.get(slug) || 0) + 1);
    }
  }

  const walk = (nodes, depth) =>
    nodes.flatMap((node) => [
      {
        id: node._id,
        value: node.slug,
        label: node.name,
        depth,
        // Top level filters on `category`; anything deeper on `subcategory`,
        // because that is all a product references.
        group: depth === 0 ? 'categories' : 'subcategories',
        count: counts.get(String(node.slug)) || 0,
        children: walk(node.children || [], depth + 1),
      },
    ]);

  return walk(tree, 0);
}

/** Chips for the active filters, so state is never hidden in a closed sheet. */
export function activeChips(filters, facets) {
  const chips = [];
  const label = (list, value) => list?.find((o) => o.value === value)?.label ?? value;

  for (const group of ['categories', 'subcategories']) {
    for (const c of filters[group] || []) {
      chips.push({ key: `${group}:${c}`, group, value: c, label: label(facets[group], c) });
    }
  }
  for (const group of ['colors', 'sizes', 'finishes', 'tags']) {
    for (const v of filters[group]) {
      chips.push({ key: `${group}:${v}`, group, value: v, label: v });
    }
  }
  if (filters.minPrice) chips.push({ key: 'minPrice', group: 'minPrice', label: `Min ₹${filters.minPrice}` });
  if (filters.maxPrice) chips.push({ key: 'maxPrice', group: 'maxPrice', label: `Max ₹${filters.maxPrice}` });

  return chips;
}

/** Removing a chip must clear exactly that one filter. */
export function removeChip(filters, chip) {
  if (chip.group === 'minPrice') return { ...filters, minPrice: '' };
  if (chip.group === 'maxPrice') return { ...filters, maxPrice: '' };
  return { ...filters, [chip.group]: filters[chip.group].filter((v) => v !== chip.value) };
}
