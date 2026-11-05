"use client";

import { useState, useMemo } from "react";
import type { ProductWithVariants } from "@/schemas";
import {
  ProductImageGallery,
  ProductInfo,
  ProductSpecifications,
  ProductDetailsTabs,
  FAQSection,
  PreviouslyViewed
} from "@/components/product-detail";

interface ProductDetailClientProps {
  product: ProductWithVariants;
  productImages: string[];
}

interface VariantImage {
  url: string;
  public_id: string;
  isFeatured?: boolean;
}

interface Variant {
  images?: VariantImage[];
  [key: string]: any;
}

export const ProductDetailClient = ({ product, productImages }: ProductDetailClientProps) => {
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);

  // Compute display images based on selected variant
  const displayImages = useMemo(() => {
    console.log('🖼️ Computing Display Images:', {
      hasSelectedVariant: !!selectedVariant,
      variantHasImages: selectedVariant?.images?.length || 0,
      mainProductImages: productImages.length,
      selectedVariant
    });

    if (selectedVariant && selectedVariant.images && selectedVariant.images.length > 0) {
      // Variant has its own images, use them
      const variantImages = selectedVariant.images.map((img) => img.url);
      console.log('✅ Using Variant Images:', variantImages);
      return variantImages;
    }
    // No variant selected or variant has no images, use main product images
    console.log('📦 Using Main Product Images:', productImages);
    return productImages;
  }, [selectedVariant, productImages]);


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Main Product Section - Image Gallery + Product Info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Left: Image Gallery */}
          <ProductImageGallery
            images={displayImages}
            productName={product.name}
          />

          {/* Right: Product Info */}
          <ProductInfo
            product={product}
            onVariantChange={setSelectedVariant}
          />
        </div>

        {/* Product Specifications */}
        <div className="mb-8">
          <ProductSpecifications product={product} />
        </div>

        {/* Product Details Tabs */}
        <div className="mb-8">
          <ProductDetailsTabs product={product} />
        </div>

        {/* FAQ Section */}
        <div className="mb-8">
          <FAQSection />
        </div>

        {/* Previously Viewed */}
        <div className="mb-8">
          <PreviouslyViewed currentProductId={product.id} />
        </div>
      </div>
    </div>
  );
};
