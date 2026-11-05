"use client";

import { useState } from "react";
import type { ProductWithVariants } from "@/schemas";

interface ProductDetailsTabsProps {
  product: ProductWithVariants;
}

export const ProductDetailsTabs = ({ product }: ProductDetailsTabsProps) => {
  const [activeTab, setActiveTab] = useState("description");

  const tabs = [
    { id: "description", label: "Description" },
    { id: "specifications", label: "Specifications" },
    { id: "highlights", label: "Highlights" },
    { id: "care", label: "Care Instructions" },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Tab Headers */}
      <div className="flex border-b border-gray-200 bg-slate-50 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-max px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${activeTab === tab.id
              ? "bg-white text-orange-500 border-b-2 border-orange-500"
              : "text-slate-600 hover:text-slate-800"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "description" && (
          <div className="space-y-4 text-slate-700">
            {/* Product Description */}
            {product.description && (
              <div className="prose max-w-none">
                <p className="text-base leading-relaxed whitespace-pre-line">
                  {product.description}
                </p>
              </div>
            )}

            {/* Short Description if available */}
            {product.shortDescription && product.shortDescription !== product.description && (
              <div className="bg-orange-50 border-l-4 border-orange-500 p-4">
                <p className="text-sm font-medium text-slate-800">
                  {product.shortDescription}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "specifications" && (
          <div className="space-y-3 text-slate-700">
            <p className="font-semibold text-slate-800 mb-4">Product Specifications:</p>
            <ul className="space-y-2">
              {/* Category */}
              {product.categoryName && (
                <li><strong>Category:</strong> {product.categoryName}</li>
              )}

              {/* Subcategory */}
              {product.subcategoryName && (
                <li><strong>Subcategory:</strong> {product.subcategoryName}</li>
              )}

              {/* Brand */}
              {product.brand?.name && (
                <li><strong>Brand:</strong> {product.brand.name}</li>
              )}

              {/* Warranty */}
              {product.warranty && (
                <li><strong>Warranty:</strong> {product.warranty} {product.warranty === 1 ? 'year' : 'years'}</li>
              )}

              {/* Material */}
              {product.material && (
                <li><strong>Material:</strong> {product.material.charAt(0).toUpperCase() + product.material.slice(1)}</li>
              )}

              {/* Available Finishes */}
              {product.variants && product.variants.length > 0 && (
                <>
                  {(() => {
                    const finishes = Array.from(new Set(product.variants.map((v: any) => v.finish).filter(Boolean)));
                    if (finishes.length > 0) {
                      return <li><strong>Available Finish:</strong> {finishes.map((f: any) => f.charAt(0).toUpperCase() + f.slice(1)).join(', ')}</li>;
                    }
                    return null;
                  })()}

                  {/* Available Colors */}
                  {(() => {
                    const colors = Array.from(new Set(product.variants.map((v: any) => v.color).filter(Boolean)));
                    if (colors.length > 0) {
                      return <li><strong>Available Colors:</strong> {colors.join(', ')}</li>;
                    }
                    return null;
                  })()}

                  {/* Available Sizes */}
                  {(() => {
                    const sizes = Array.from(new Set(
                      product.variants.flatMap((v: any) =>
                        (v.sizes && v.sizes.length > 0) ? v.sizes : [v.size]
                      ).filter(Boolean)
                    ));
                    if (sizes.length > 0) {
                      return <li><strong>Available Sizes:</strong> {sizes.join(', ')}</li>;
                    }
                    return null;
                  })()}
                </>
              )}
            </ul>
          </div>
        )}

        {activeTab === "highlights" && (
          <div className="space-y-4 text-slate-700">
            {product.highlights && product.highlights.length > 0 ? (
              <ul className="list-disc list-inside space-y-2 ml-4">
                {product.highlights.map((highlight: string, index: number) => (
                  <li key={index} className="text-slate-700">{highlight}</li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500 italic">No highlights available for this product.</p>
            )}
          </div>
        )}

        {activeTab === "care" && (
          <div className="space-y-4 text-slate-700">
            {product.careInstructions && product.careInstructions.length > 0 ? (
              <>
                <p className="font-semibold text-slate-800">Care &amp; Maintenance Guidelines:</p>
                <ul className="space-y-3 ml-4 list-disc">
                  {product.careInstructions.map((instruction: any, index: number) => (
                    <li key={index}>
                      {instruction.title && <strong>{instruction.title}:</strong>}
                      {instruction.title && instruction.description ? ' ' : ''}
                      {instruction.description}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-slate-500 italic">Care instructions are not available for this product.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
