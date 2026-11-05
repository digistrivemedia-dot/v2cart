/** COMPONENTS */
import { ProductImage } from "../products/ProductImage";
import Link from "next/link";
import { DeleteButton } from "./DeleteButton";
import { ProductCartInfo } from "./ProductCartInfo";
/** TYPES */
import type { CartItem, ProductVariant, ProductWithVariants } from "@/schemas";

/**
 * Returns the correct price for a given size by searching through product variants.
 */
const getPriceForSize = (product: any, size: string): number => {
  if (!product) return 0;
  if (product.variants && product.variants.length > 0) {
    for (const variant of product.variants) {
      const variantSizes: string[] =
        variant.sizes && variant.sizes.length > 0
          ? variant.sizes
          : variant.size
            ? [variant.size]
            : [];
      if (variantSizes.includes(size)) {
        return variant.price ?? product.price ?? 0;
      }
    }
  }
  return product.price ?? 0;
};

interface CartProductProps {
  product: ProductWithVariants;
  cartItemId: CartItem["id"];
  size: CartItem["size"];
  quantity: CartItem["quantity"];
  variant: ProductVariant;
}

export const CartProduct = ({
  product,
  cartItemId,
  size,
  quantity,
  variant,
}: CartProductProps) => {
  const { name, cuttedPrice, category, id } = product;
  const productLink = `/${category}/${id}?variant=${variant.color}`;

  // Get the size-specific price
  const price = getPriceForSize(product, size);

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm transition-all hover:shadow-md overflow-hidden">

      {/* Mobile layout: image top, content below */}
      {/* Desktop layout: image left, content right */}
      <div className="flex flex-col sm:flex-row gap-4 md:gap-6 items-start">

        {/* Product Image */}
        <Link
          href={productLink}
          className="flex-shrink-0 w-full sm:w-28 md:w-32 h-48 sm:h-28 md:h-32 rounded-xl overflow-hidden bg-slate-100 relative group block"
        >
          <ProductImage
            image={variant.images[0]}
            name={name}
            width={128}
            height={128}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            sizes="128px"
          />
        </Link>

        {/* Product Details */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 w-full">
          {/* Name + Price row */}
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <Link href={productLink} className="hover:text-orange-600 transition-colors">
                <h3 className="text-base md:text-lg font-bold text-slate-900 line-clamp-2">
                  {name}
                </h3>
              </Link>
              <div className="text-sm text-slate-500 mt-0.5 capitalize">
                Category: {category}
              </div>
            </div>

            <div className="text-right flex-shrink-0">
              <div className="text-lg font-bold text-slate-900">
                ₹{price.toFixed(2)}
              </div>
              {cuttedPrice && cuttedPrice > price && (
                <div className="text-sm text-slate-400 line-through">
                  ₹{cuttedPrice.toFixed(2)}
                </div>
              )}
            </div>
          </div>

          {/* Controls: Size/Color + Quantity + Delete — all below image on mobile */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ProductCartInfo
              cartItemId={cartItemId}
              size={size}
              quantity={quantity}
              color={variant.color}
            />
            <DeleteButton cartItemId={cartItemId} />
          </div>
        </div>
      </div>
    </div>
  );
};
