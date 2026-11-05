import { FiImage } from "react-icons/fi";

interface ProductPreviewCardProps {
  name: string;
  shortDescription?: string;
  imageUrl?: string;
  price: number;
  cuttedPrice?: number;
  tags?: string[];
  variantCount?: number;
}

/**
 * Non-interactive stand-in for the real ProductItem card, used while a
 * product is still a draft (no id/category yet, so ProductItem's Link/
 * WishlistButton can't render safely). Mirrors its visual layout so what the
 * admin sees here matches what customers will see once saved.
 */
export function ProductPreviewCard({
  name,
  shortDescription,
  imageUrl,
  price,
  cuttedPrice,
  tags = [],
  variantCount = 0,
}: ProductPreviewCardProps) {
  const discount =
    price > 0 && cuttedPrice && cuttedPrice > price
      ? Math.round(((cuttedPrice - price) / cuttedPrice) * 100)
      : 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="relative aspect-[4/3] bg-slate-100 flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt={name || "Product preview"} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center text-slate-300">
            <FiImage className="w-10 h-10 mb-1" />
            <span className="text-xs">No image yet</span>
          </div>
        )}
        {discount > 0 && (
          <span className="absolute bottom-3 left-3 px-2 py-1 bg-green-500 text-white text-xs font-bold rounded">
            -{discount}%
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="text-base font-semibold text-slate-800 mb-2 line-clamp-2 min-h-[3rem]">
          {name || <span className="text-slate-300">Product name will appear here</span>}
        </h3>

        <div className="flex items-baseline gap-2">
          <p className="text-xl font-bold text-orange-500">₹{price || 0}</p>
          {cuttedPrice && cuttedPrice > price && (
            <p className="text-sm text-gray-400 line-through">₹{cuttedPrice}</p>
          )}
        </div>

        {shortDescription && (
          <p className="mt-2 text-xs text-gray-500 line-clamp-2">{shortDescription}</p>
        )}

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                {tag}
              </span>
            ))}
          </div>
        )}

        {variantCount > 0 && (
          <p className="mt-3 text-xs text-gray-600 pt-3 border-t border-gray-100">
            {variantCount} variant{variantCount > 1 ? "s" : ""} available
          </p>
        )}

        <button
          type="button"
          disabled
          className="w-full mt-4 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium opacity-60 cursor-not-allowed"
        >
          View Details
        </button>
      </div>
    </div>
  );
}
