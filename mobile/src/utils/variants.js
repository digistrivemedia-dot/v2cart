/**
 * Variant selection for the product page.
 *
 * The web's ProductInfo treats the product itself as the first option and the
 * `variants` array as the rest, then derives colour/size/finish lists from
 * that combined set. This mirrors that, because a product's own colour/size
 * is a real buyable option and leaving it out makes the first variant look
 * like the default when it isn't.
 *
 * Pure functions, no React, so the cross-availability rules are testable —
 * they are the fiddly part: which sizes exist in the chosen colour, which
 * colours exist in the chosen size.
 */

const clean = (values) => [...new Set(values.filter(Boolean).map(String))];

/** Sizes an option offers: `sizes[]` when present, else the single `size`. */
const sizesOf = (option) =>
  option?.sizes?.length ? option.sizes.filter(Boolean) : [option?.size].filter(Boolean);

/**
 * The product plus its variants, as one list of selectable options.
 *
 * The product goes first and is flagged, so callers can tell "the product as
 * listed" apart from an added variant.
 */
export function variantOptions(product) {
  if (!product) return [];

  return [
    {
      color: product.color,
      size: product.size,
      finish: product.finish,
      stock: product.stock,
      images: product.images,
      productId: product.productId,
      isMainProduct: true,
    },
    ...(product.variants || []),
  ];
}

/** Every colour / size / finish offered, across the product and its variants. */
export function variantFacets(product) {
  const options = variantOptions(product);
  return {
    colors: clean(options.map((o) => o.color)),
    sizes: clean(options.flatMap(sizesOf)),
    finishes: clean(options.map((o) => o.finish)),
  };
}

/**
 * Which sizes exist in a given colour, and which colours exist in a given
 * size — so the UI can mark the rest unavailable instead of letting someone
 * pick a combination that doesn't exist.
 */
export function availability(product, { color, size }) {
  const options = variantOptions(product);
  const facets = variantFacets(product);

  const sizesForColor = color
    ? clean(options.filter((o) => o.color === color).flatMap(sizesOf))
    : facets.sizes;

  const colorsForSize = size
    ? clean(options.filter((o) => sizesOf(o).includes(size)).map((o) => o.color))
    : facets.colors;

  return { sizesForColor, colorsForSize };
}

/**
 * The option matching a selection, falling back to the product itself.
 *
 * Finish only narrows when one is chosen: a product with finishes but none
 * selected should still resolve to a buyable option rather than nothing.
 */
export function resolveVariant(product, { color, size, finish }) {
  const options = variantOptions(product);

  const found = options.find(
    (o) =>
      (!color || o.color === color) &&
      (!size || sizesOf(o).includes(size)) &&
      (!finish || o.finish === finish)
  );

  return found || options[0] || null;
}

/**
 * The images to show for a selection: the variant's own if it has any, else
 * the product's. Featured first, as everywhere else in the app.
 */
export function variantImages(product, variant) {
  const source = variant?.images?.length ? variant.images : product?.images || [];
  const featured = source.filter((i) => i.isFeatured);
  const rest = source.filter((i) => !i.isFeatured);
  return [...featured, ...rest];
}

/**
 * The initial selection — the product's own colour/size/finish when it has
 * them, otherwise the first variant's. Matches the web, which deliberately
 * seeds from the main product so the page opens on what it describes.
 */
export function initialSelection(product) {
  const first = product?.variants?.[0];
  return {
    color: product?.color || first?.color || '',
    size: product?.size || sizesOf(first)[0] || '',
    finish: product?.finish || first?.finish || '',
  };
}
