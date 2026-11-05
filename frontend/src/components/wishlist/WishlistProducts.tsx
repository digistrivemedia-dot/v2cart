"use client";

/** COMPONENTS */
import { GridProducts } from "../products/GridProducts";
import { ProductItem } from "../products/ProductItem";
import Link from "next/link";
/** FUNCTIONALITY */
import { useWishlist } from "@/hooks/wishlist";
/** TYPES */
import type { ProductWithVariants } from "@/schemas";
/** ICONS */
import { FiHeart, FiArrowRight } from "react-icons/fi";

export const WishlistProducts = ({
  allProducts,
}: {
  allProducts: ProductWithVariants[];
}) => {
  const { items: wishlistProducts } = useWishlist();

  if (wishlistProducts && wishlistProducts.length > 0) {
    const products = allProducts.filter((product) =>
      wishlistProducts.some(
        (wishlistProduct) => wishlistProduct.productId === product.id
      )
    );

    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-12 text-center">
            <span className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-3 block">
              Saved Items
            </span>
            <h1 className="text-3xl md:text-4xl font-light text-slate-900 mb-4 tracking-tight">
              My Wishlist
            </h1>
            <p className="text-slate-500 font-light max-w-lg mx-auto text-lg leading-relaxed">
              Your curated collection of favorites. Review and add them to your cart when you&apos;re ready.
            </p>
            <div className="w-16 h-1 bg-slate-900 mx-auto mt-8 rounded-full opacity-10"></div>
          </div>

          <GridProducts className="grid-cols-auto-fill-250">
            {products.map((product) => (
              <ProductItem key={product.id} product={product} />
            ))}
          </GridProducts>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center w-full bg-gray-50 px-4">
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 relative z-10">
          <FiHeart className="w-8 h-8 text-slate-300" />
        </div>
        <div className="absolute inset-0 bg-slate-200 rounded-full blur-xl opacity-20 transform scale-150"></div>
      </div>

      <h1 className="mb-3 text-2xl md:text-3xl font-light text-slate-900 text-center tracking-tight">
        Your wishlist is empty
      </h1>

      <p className="mb-10 text-slate-500 text-center max-w-md font-light text-lg leading-relaxed">
        It seems you haven't found any favorites yet. Explore our collection to find something you'll love.
      </p>

      <Link
        href="/"
        className="group relative inline-flex items-center justify-center px-8 py-4 bg-slate-900 text-white text-sm font-medium tracking-wide transition-all duration-300 hover:bg-slate-800 hover:shadow-xl hover:-translate-y-0.5 rounded-full overflow-hidden"
      >
        <span className="relative z-10 flex items-center gap-2">
          Start Exploring
          <FiArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </span>
      </Link>
    </div>
  );
};
