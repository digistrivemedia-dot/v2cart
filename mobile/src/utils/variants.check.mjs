/**
 * Self-check for variant selection on the product page.
 * Run with: node src/utils/variants.check.mjs
 */
import assert from 'node:assert';
import {
  variantOptions,
  variantFacets,
  availability,
  resolveVariant,
  variantImages,
  initialSelection,
} from './variants.js';

// A product listed in White/12x12/Matte, with two added variants. Blue only
// comes in 24x24; Red comes in two sizes via `sizes[]`.
const PRODUCT = {
  name: 'Tile',
  color: 'White',
  size: '12x12',
  finish: 'Matte',
  stock: 10,
  images: [{ url: 'main-a', isFeatured: false }, { url: 'main-b', isFeatured: true }],
  variants: [
    { color: 'Blue', size: '24x24', finish: 'Gloss', stock: 3, images: [{ url: 'blue-1' }] },
    { color: 'Red', sizes: ['12x12', '32x32'], finish: 'Matte', stock: 0 },
  ],
};

// --- The product itself is the first option, not just its variants --------
{
  const options = variantOptions(PRODUCT);
  assert.strictEqual(options.length, 3, 'product + 2 variants');
  assert.strictEqual(options[0].isMainProduct, true, 'the product comes first');
  assert.strictEqual(options[0].color, 'White');
  assert.deepStrictEqual(variantOptions(null), [], 'no product, no options');
  assert.strictEqual(variantOptions({ name: 'bare' }).length, 1, 'a product with no variants is still one option');
}

// --- Facets span the product and every variant ---------------------------
{
  const f = variantFacets(PRODUCT);
  assert.deepStrictEqual(f.colors, ['White', 'Blue', 'Red']);
  // 12x12 appears on both the product and Red: offered once.
  assert.deepStrictEqual(f.sizes, ['12x12', '24x24', '32x32']);
  assert.deepStrictEqual(f.finishes, ['Matte', 'Gloss']);
}

// --- Cross-availability: the fiddly part ---------------------------------
{
  // Blue exists only in 24x24.
  assert.deepStrictEqual(availability(PRODUCT, { color: 'Blue' }).sizesForColor, ['24x24']);
  // Red carries its sizes as an array.
  assert.deepStrictEqual(availability(PRODUCT, { color: 'Red' }).sizesForColor, ['12x12', '32x32']);
  // 12x12 is offered by the product (White) and by Red — not Blue.
  assert.deepStrictEqual(availability(PRODUCT, { size: '12x12' }).colorsForSize, ['White', 'Red']);
  assert.deepStrictEqual(availability(PRODUCT, { size: '24x24' }).colorsForSize, ['Blue']);
  // Nothing selected means nothing is ruled out.
  assert.deepStrictEqual(availability(PRODUCT, {}).sizesForColor, ['12x12', '24x24', '32x32']);
}

// --- Resolving a selection to a real option ------------------------------
{
  assert.strictEqual(resolveVariant(PRODUCT, { color: 'Blue', size: '24x24' }).stock, 3);
  // Matches inside a variant's `sizes[]`, not just its `size`.
  assert.strictEqual(resolveVariant(PRODUCT, { color: 'Red', size: '32x32' }).stock, 0);
  // An impossible combination falls back to the product rather than null, so
  // the page always has something to price and sell.
  assert.strictEqual(
    resolveVariant(PRODUCT, { color: 'Blue', size: '12x12' }).isMainProduct,
    true,
    'no match falls back to the product'
  );
  // Finish only narrows once chosen.
  assert.strictEqual(resolveVariant(PRODUCT, { color: 'White' }).finish, 'Matte');
  assert.strictEqual(resolveVariant(PRODUCT, { finish: 'Gloss' }).color, 'Blue');
}

// --- Images follow the variant, featured first ---------------------------
{
  const main = variantImages(PRODUCT, resolveVariant(PRODUCT, { color: 'White' }));
  assert.deepStrictEqual(main.map((i) => i.url), ['main-b', 'main-a'], 'featured image leads');

  const blue = variantImages(PRODUCT, resolveVariant(PRODUCT, { color: 'Blue' }));
  assert.deepStrictEqual(blue.map((i) => i.url), ['blue-1'], "the variant's own images win");

  // Red has no images, so it shows the product's.
  const red = variantImages(PRODUCT, resolveVariant(PRODUCT, { color: 'Red', size: '32x32' }));
  assert.deepStrictEqual(red.map((i) => i.url), ['main-b', 'main-a'], 'falls back to product images');
}

// --- The page opens on what the product describes ------------------------
{
  assert.deepStrictEqual(initialSelection(PRODUCT), {
    color: 'White',
    size: '12x12',
    finish: 'Matte',
  });

  // A product with no own attributes seeds from its first variant.
  const variantOnly = { variants: [{ color: 'Blue', sizes: ['24x24'], finish: 'Gloss' }] };
  assert.deepStrictEqual(initialSelection(variantOnly), {
    color: 'Blue',
    size: '24x24',
    finish: 'Gloss',
  });

  assert.deepStrictEqual(initialSelection({}), { color: '', size: '', finish: '' });
}

console.log('variants: all checks passed');
