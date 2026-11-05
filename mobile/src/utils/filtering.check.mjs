/**
 * Self-check for search filtering + sorting.
 * Run with: node src/utils/filtering.check.mjs
 */
import assert from 'node:assert';
import {
  applyFilters,
  applySort,
  activeChips,
  removeChip,
  buildFacets,
  buildCategoryOptions,
  EMPTY_FILTERS,
  PREDEFINED_TAGS,
  countActiveFilters,
} from './filtering.js';

const P = [
  { _id: '1', name: 'A', price: 100, color: 'White', size: '600x600', finish: 'Matte', tags: ['popular'], ratings: 4, createdAt: '2026-01-01', category: { slug: 'floor', name: 'Floor' } },
  { _id: '2', name: 'B', price: 500, color: 'Grey', size: '300x300', finish: 'Gloss', tags: ['new'], ratings: 5, createdAt: '2026-06-01', category: { slug: 'wall', name: 'Wall' } },
  { _id: '3', name: 'C', price: 250, color: 'white', size: '600x600', finish: 'Matte', tags: ['popular', 'new'], ratings: 3, createdAt: '2026-03-01', category: { slug: 'floor', name: 'Floor' } },
];
const f = (over) => ({ ...EMPTY_FILTERS, ...over });

// --- No filters returns everything ---------------------------------------
assert.strictEqual(applyFilters(P, f({})).length, 3);

// --- Price range is inclusive at both ends --------------------------------
assert.deepStrictEqual(applyFilters(P, f({ minPrice: '100', maxPrice: '250' })).map(p => p._id), ['1', '3']);
assert.deepStrictEqual(applyFilters(P, f({ minPrice: '250' })).map(p => p._id), ['2', '3']);
assert.deepStrictEqual(applyFilters(P, f({ maxPrice: '100' })).map(p => p._id), ['1']);

// --- Facet matching is case-insensitive (data has 'White' and 'white') ----
assert.deepStrictEqual(applyFilters(P, f({ colors: ['White'] })).map(p => p._id), ['1', '3']);

// --- Multi-select within a group is OR, not AND ---------------------------
assert.strictEqual(applyFilters(P, f({ colors: ['White', 'Grey'] })).length, 3);
assert.deepStrictEqual(applyFilters(P, f({ tags: ['new'] })).map(p => p._id), ['2', '3']);
assert.strictEqual(applyFilters(P, f({ tags: ['popular', 'new'] })).length, 3, 'two tags widens');

// --- Different groups AND together ----------------------------------------
assert.deepStrictEqual(
  applyFilters(P, f({ colors: ['white'], finishes: ['Matte'], maxPrice: '150' })).map(p => p._id),
  ['1']
);

// --- Category matches on slug ---------------------------------------------
assert.deepStrictEqual(applyFilters(P, f({ categories: ['floor'] })).map(p => p._id), ['1', '3']);

// --- A filter matching nothing yields an empty list, not everything -------
assert.strictEqual(applyFilters(P, f({ colors: ['Pink'] })).length, 0);

// --- Sorting ---------------------------------------------------------------
assert.deepStrictEqual(applySort(P, 'price-asc').map(p => p._id), ['1', '3', '2']);
assert.deepStrictEqual(applySort(P, 'price-desc').map(p => p._id), ['2', '3', '1']);
assert.deepStrictEqual(applySort(P, 'rating').map(p => p._id), ['2', '1', '3']);
assert.deepStrictEqual(applySort(P, 'newest').map(p => p._id), ['2', '3', '1']);
assert.deepStrictEqual(applySort(P, 'relevance').map(p => p._id), ['1', '2', '3'], 'relevance keeps server order');

// --- Sorting must not mutate the input ------------------------------------
const before = P.map(p => p._id);
applySort(P, 'price-desc');
assert.deepStrictEqual(P.map(p => p._id), before, 'applySort copied rather than sorted in place');

// --- Chips reflect state and remove exactly one thing ---------------------
{
  const facets = { categories: [{ value: 'floor', label: 'Floor' }] };
  const filters = f({ categories: ['floor'], colors: ['White'], minPrice: '100' });
  const chips = activeChips(filters, facets);
  assert.strictEqual(chips.length, 3);
  assert.ok(chips.find(c => c.label === 'Floor'), 'category chip shows its name, not its slug');

  const afterColor = removeChip(filters, chips.find(c => c.group === 'colors'));
  assert.deepStrictEqual(afterColor.colors, []);
  assert.deepStrictEqual(afterColor.categories, ['floor'], 'other groups untouched');

  const afterPrice = removeChip(filters, { group: 'minPrice' });
  assert.strictEqual(afterPrice.minPrice, '');
}

// --- countActiveFilters -----------------------------------------------
assert.strictEqual(countActiveFilters(EMPTY_FILTERS), 0);
assert.strictEqual(countActiveFilters(f({ colors: ['White'], minPrice: '10' })), 2);
assert.strictEqual(countActiveFilters(f({ sort: 'price-asc' })), 1, 'a non-default sort counts');

// --- Variant attributes count as the product's own ------------------------
// A product whose only blue option is on a variant is still available in
// blue; filtering the top-level field alone used to hide it.
{
  const V = [
    {
      _id: 'v1',
      price: 100,
      color: 'White',
      category: { slug: 'floor', name: 'Floor' },
      variants: [
        { color: 'Blue', size: '12x12', finish: 'Gloss' },
        { color: 'Blue', sizes: ['24x24', '32x32'] },
      ],
    },
  ];

  assert.strictEqual(applyFilters(V, f({ colors: ['Blue'] })).length, 1, 'variant colour matches');
  assert.strictEqual(applyFilters(V, f({ colors: ['White'] })).length, 1, 'base colour still matches');
  assert.strictEqual(applyFilters(V, f({ sizes: ['32x32'] })).length, 1, 'variant sizes[] matches');
  assert.strictEqual(applyFilters(V, f({ finishes: ['Gloss'] })).length, 1, 'variant finish matches');
  assert.strictEqual(applyFilters(V, f({ colors: ['Pink'] })).length, 0);

  // A repeated variant value must not inflate the count past the number of
  // products that actually offer it.
  const colors = buildFacets(V).colors;
  assert.strictEqual(colors.find((o) => o.value === 'Blue').count, 1, 'one product, one count');
  assert.deepStrictEqual(
    buildFacets(V).sizes.map((o) => o.value).sort(),
    ['12x12', '24x24', '32x32'],
    'every variant size is offered'
  );
}

// --- Facets never offer an option that filters to nothing -----------------
// The sheet is built from buildFacets and the grid from applyFilters; if the
// two disagree on what a product "has", the UI offers a dead end.
for (const group of ['colors', 'sizes', 'finishes']) {
  for (const option of buildFacets(P)[group]) {
    const hits = applyFilters(P, f({ [group]: [option.value] }));
    assert.strictEqual(
      hits.length,
      option.count,
      `${group}=${option.value}: facet says ${option.count}, filter found ${hits.length}`
    );
  }
}

// --- Tags are always the full predefined set, with live counts -------------
{
  const tags = buildFacets(P).tags;
  assert.deepStrictEqual(tags.map((t) => t.value), PREDEFINED_TAGS, 'full set, web order');
  assert.strictEqual(tags.find((t) => t.value === 'popular').count, 2);
  assert.strictEqual(tags.find((t) => t.value === 'limited').count, 0, 'unused tag still offered');
}

// --- Subcategory is its own filter group ----------------------------------
{
  const S = [
    { _id: 's1', price: 10, category: { slug: 'home', name: 'Home' }, subcategory: { slug: 'lighting', name: 'Lighting' } },
    { _id: 's2', price: 20, category: { slug: 'home', name: 'Home' }, subcategory: { slug: 'furniture', name: 'Furniture' } },
    { _id: 's3', price: 30, category: { slug: 'home', name: 'Home' } },
  ];

  assert.deepStrictEqual(applyFilters(S, f({ subcategories: ['lighting'] })).map(p => p._id), ['s1']);
  // Category and subcategory AND together, like separate groups elsewhere.
  assert.deepStrictEqual(
    applyFilters(S, f({ categories: ['home'], subcategories: ['furniture'] })).map(p => p._id),
    ['s2']
  );
  assert.strictEqual(countActiveFilters(f({ subcategories: ['lighting'] })), 1);

  const chips = activeChips(f({ subcategories: ['lighting'] }), buildFacets(S));
  assert.strictEqual(chips[0].label, 'Lighting', 'subcategory chip shows its name');
  assert.deepStrictEqual(removeChip(f({ subcategories: ['lighting'] }), chips[0]).subcategories, []);
}

// --- Category options come from the store's tree, not from the results ----
{
  const tree = [
    {
      _id: 'c1',
      name: 'Home',
      slug: 'home',
      children: [
        { _id: 'c2', name: 'Lighting', slug: 'lighting', children: [] },
        { _id: 'c3', name: 'Empty Shelf', slug: 'empty-shelf', children: [] },
      ],
    },
  ];
  const results = [{ _id: 'x', category: { slug: 'home' }, subcategory: { slug: 'lighting' } }];
  const options = buildCategoryOptions(tree, results);

  assert.strictEqual(options.length, 1, 'one root');
  assert.strictEqual(options[0].group, 'categories', 'depth 0 filters on category');
  assert.strictEqual(options[0].count, 1);

  const [lighting, empty] = options[0].children;
  assert.strictEqual(lighting.group, 'subcategories', 'depth 1 filters on subcategory');
  assert.strictEqual(lighting.count, 1);
  assert.strictEqual(empty.count, 0, 'a category with no results is still listed');
  assert.strictEqual(empty.depth, 1);
}

console.log('filtering: all checks passed');
