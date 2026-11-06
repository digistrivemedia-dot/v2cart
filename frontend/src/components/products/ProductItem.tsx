"use client";

import { ProductImage } from "./ProductImage";
import Link from "next/link";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import type { ProductWithVariants } from "@/schemas";

const WishlistButton = dynamic(
  () => import("../wishlist/WishlistButton")
);

interface ProductItemProps {
  product: ProductWithVariants;
}

const tagConfig: Record<string, { color: string; emoji: string }> = {
  popular:    { color: "bg-blue-100 text-blue-700",    emoji: "⭐" },
  trending:   { color: "bg-yellow-100 text-yellow-700", emoji: "🔥" },
  new:        { color: "bg-green-100 text-green-700",   emoji: "✨" },
  premium:    { color: "bg-purple-100 text-purple-700", emoji: "💎" },
  exclusive:  { color: "bg-pink-100 text-pink-700",    emoji: "👑" },
  classic:    { color: "bg-slate-100 text-slate-700",   emoji: "🏛️" },
  bestseller: { color: "bg-orange-100 text-orange-700", emoji: "🏆" },
  limited:    { color: "bg-red-100 text-red-700",      emoji: "⏰" },
};

export const ProductItem = ({ product }: ProductItemProps) => {
  const { name, id, img, price, category, variants } = product;
  const stock: number | undefined = (product as any).stock;
  const isOutOfStock = stock !== undefined && stock <= 0;
  const cuttedPrice = (product as any).cuttedPrice;
  const tags: string[] = (product as any).tags || [];
  const shortDescription = (product as any).shortDescription || (product as any).description || "";
  const discount = price > 0 && cuttedPrice > price
    ? Math.round(((cuttedPrice - price) / cuttedPrice) * 100)
    : 0;

  const firstVariantColor = variants && variants.length > 0 ? variants[0].color : "default";
  const productLink = `/${category}/${id}?variant=${firstVariantColor}`;

  return (
    <div className="group bg-white rounded-lg shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-200">
      {/* Image */}
      <Link href={productLink} className="block relative overflow-hidden">
        <div className="relative aspect-[4/3]">
          <ProductImage
            image={img}
            name={name}
            width={400}
            height={400}
            sizes="(max-width: 640px) 100vw, (max-width: 1154px) 33vw, (max-width: 1536px) 25vw, 20vw"
          />
          <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
          {isOutOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
                Out of stock
              </span>
            </div>
          )}
        </div>

        {discount > 0 && (
          <div className="absolute bottom-3 left-3 z-10">
            <span className="px-2 py-1 bg-green-500 text-white text-xs font-bold rounded">
              -{discount}%
            </span>
          </div>
        )}

        <div className="absolute top-3 right-3 z-10">
          <WishlistButton productId={id} />
        </div>
      </Link>

      {/* Info */}
      <div className="p-4">
        <Link href={productLink}>
          <h3 className="text-base font-semibold text-slate-800 mb-2 line-clamp-2 hover:text-orange-500 transition-colors min-h-[3rem]">
            {name}
          </h3>
        </Link>

        <div className="flex items-center justify-between mt-3">
          <div>
            {price > 0 ? (
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-orange-500">₹{price.toFixed(0)}</p>
                {cuttedPrice > price && (
                  <p className="text-sm text-gray-400 line-through">₹{cuttedPrice.toFixed(0)}</p>
                )}
              </div>
            ) : (
              <>
                <p className="text-base font-semibold text-blue-600">Get Price</p>
                <p className="text-xs text-gray-500">Contact us</p>
              </>
            )}
          </div>

          {/* @ts-ignore */}
          {(variants[0]?.sizes?.[0] || variants[0]?.size) && (
            <div className="text-right">
              {/* @ts-ignore */}
              <p className="text-sm font-medium text-slate-700">{variants[0]?.sizes?.[0] || variants[0]?.size}"</p>
              <p className="text-xs text-gray-500">Size</p>
            </div>
          )}
        </div>

        {variants && variants.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-600 mb-2">{variants.length} Variant{variants.length > 1 ? "s" : ""} Available</p>
            <div className="flex flex-wrap gap-1.5">
              {variants.slice(0, 3).map((v: any, idx: number) => (
                <span
                  key={idx}
                  className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded border border-gray-200"
                  title={v.color}
                >
                  {v.color}
                </span>
              ))}
              {variants.length > 3 && (
                <span className="px-2 py-1 text-xs font-medium bg-orange-50 text-orange-600 rounded border border-orange-200">
                  +{variants.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => {
              const cfg = tagConfig[tag];
              if (!cfg) return null;
              return (
                <span key={tag} className={`px-2 py-0.5 text-xs font-medium rounded-full ${cfg.color}`}>
                  {cfg.emoji} {tag.charAt(0).toUpperCase() + tag.slice(1)}
                </span>
              );
            })}
          </div>
        )}

        {shortDescription && (
          <p className="mt-2 text-xs text-gray-500 line-clamp-2">{shortDescription}</p>
        )}

        <Link href={productLink}>
          <button
            className={`w-full mt-4 py-2.5 rounded-lg transition-colors duration-300 text-sm font-medium ${
              isOutOfStock
                ? "bg-slate-200 text-slate-600 hover:bg-slate-300"
                : "bg-slate-900 text-white hover:bg-orange-500"
            }`}
          >
            {isOutOfStock ? "Out of Stock — View Details" : "View Details"}
          </button>
        </Link>
      </div>
    </div>
  );
};
