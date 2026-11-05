/** FUNCTIONALITY */
import { redirect } from "next/navigation";
import { getProduct } from "@/app/actions";
/** COMPONENTS */
import { ProductDetailClient } from "@/components/product-detail";
/** TYPES */
import type { ProductVariant } from "@/schemas";

interface SingleProductProps {
  id: string;
  selectedVariantColor?: ProductVariant["color"];
}

export const SingleProduct = async ({
  id,
  selectedVariantColor,
}: SingleProductProps) => {
  const productPlainObject = await getProduct(id);

  if (!productPlainObject) {
    return <div className="text-center py-20">Product not found</div>;
  }

  const selectedVariantObject = productPlainObject.variants.find(
    (v: any) => v.color === selectedVariantColor
  );

  if (!selectedVariantObject) {
    return redirect(
      `/${productPlainObject.category}/${id}?variant=${productPlainObject.variants[0].color}`
    );
  }

  // Use actual product images from database
  const productImages = (productPlainObject as any).images && (productPlainObject as any).images.length > 0
    ? (productPlainObject as any).images.map((img: any) => img.url || img)
    : [productPlainObject.img]; // Fallback to main image if no images array

  return (
    <ProductDetailClient
      product={productPlainObject}
      productImages={productImages}
    />
  );
};
