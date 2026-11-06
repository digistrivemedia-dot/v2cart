"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { WishlistButton } from "./WishlistButton";

interface HomeProductCardProps {
    product: {
        _id: string;
        name: string;
        category: string;
        image: string;
        price: number;
        cuttedPrice?: number;
        slug: string;
        variants?: any[];
    };
}

export const HomeProductCard = ({ product }: HomeProductCardProps) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    // Collect all images: main product image + variant images
    const allImages: string[] = [product.image];

    // Add variant images if they exist
    if (product.variants && product.variants.length > 0) {
        product.variants.forEach((variant: any) => {
            if (variant.images && Array.isArray(variant.images)) {
                variant.images.forEach((img: any) => {
                    const imageUrl = typeof img === 'string' ? img : img.url;
                    if (imageUrl && !allImages.includes(imageUrl)) {
                        allImages.push(imageUrl);
                    }
                });
            }
        });
    }

    const handleNextImage = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev + 1) % allImages.length);
    };

    const handlePrevImage = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
    };

    const discountPct =
        product.cuttedPrice && product.cuttedPrice > product.price
            ? Math.round(((product.cuttedPrice - product.price) / product.cuttedPrice) * 100)
            : null;

    return (
        <Link href={`/product/${product.slug}`} className="group block bg-white rounded-xl border border-slate-100 hover:border-brand-blue/30 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
            {/* Image */}
            <div className="relative aspect-square overflow-hidden bg-gray-50">
                <Image
                    src={allImages[currentImageIndex]}
                    alt={product.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Wishlist */}
                <div className="absolute top-2 right-2 z-10" onClick={(e) => e.preventDefault()}>
                    <WishlistButton productId={product._id} />
                </div>

                {/* Discount badge */}
                {discountPct && (
                    <div className="absolute top-2 left-2 z-10">
                        <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded">
                            {discountPct}% OFF
                        </span>
                    </div>
                )}

                {/* Image nav arrows (multi-image) */}
                {allImages.length > 1 && (
                    <>
                        <button
                            onClick={(e) => { e.preventDefault(); handlePrevImage(e); }}
                            className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 bg-black/40 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 text-xs"
                        >‹</button>
                        <button
                            onClick={(e) => { e.preventDefault(); handleNextImage(e); }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 bg-black/40 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 text-xs"
                        >›</button>
                    </>
                )}
            </div>

            {/* Info */}
            <div className="p-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{product.category}</p>
                <h3 className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug mb-2 min-h-[2.5rem] group-hover:text-brand-blue transition-colors">
                    {product.name}
                </h3>

                {product.price === 0 ? (
                    <p className="text-base font-bold text-brand-gold">Contact for Price</p>
                ) : (
                    <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-base font-bold text-slate-900">
                            ₹{product.price.toLocaleString("en-IN")}
                        </span>
                        {product.cuttedPrice && product.cuttedPrice > product.price && (
                            <>
                                <span className="text-xs text-gray-400 line-through">
                                    ₹{product.cuttedPrice.toLocaleString("en-IN")}
                                </span>
                                <span className="text-xs font-semibold text-green-600">
                                    {discountPct}% off
                                </span>
                            </>
                        )}
                    </div>
                )}
            </div>
        </Link>
    );
};
