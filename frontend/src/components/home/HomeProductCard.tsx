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

    return (
            <div className="group bg-white rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border border-slate-200 hover:-translate-y-2">
                {/* Image Container */}
                <div className="relative h-64 overflow-hidden bg-gray-100">
                    <Image
                        src={allImages[currentImageIndex]}
                        alt={product.name}
                        fill
                        className="object-cover group-hover:scale-110 transition-transform duration-500"
                    />

                    {/* Image Navigation Arrows - Show only if multiple images */}
                    {allImages.length > 1 && (
                        <>
                            <button
                                onClick={handlePrevImage}
                                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
                            >
                                ‹
                            </button>
                            <button
                                onClick={handleNextImage}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
                            >
                                ›
                            </button>
                            {/* Image Indicators */}
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-20">
                                {allImages.map((_, index) => (
                                    <div
                                        key={index}
                                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                                            index === currentImageIndex
                                                ? 'bg-white w-3'
                                                : 'bg-white/50'
                                        }`}
                                    />
                                ))}
                            </div>
                        </>
                    )}

                    {/* Wishlist Badge - Top Right */}
                    <div className="absolute top-3 right-3 z-10">
                        <WishlistButton productId={product._id} />
                    </div>

                    {/* Discount Badge - Top Left */}
                    {product.cuttedPrice && product.cuttedPrice > product.price && (
                        <div className="absolute top-3 left-3 z-10">
                            <span className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-full shadow-lg">
                                {Math.round(((product.cuttedPrice - product.price) / product.cuttedPrice) * 100)}% OFF
                            </span>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="p-5">
                    {/* Category */}
                    <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                        {product.category}
                    </p>

                    {/* Product Name */}
                    <h3 className="font-semibold text-lg text-slate-900 mb-3 line-clamp-2 min-h-[3.5rem] group-hover:text-yellow-500 transition-colors">
                        {product.name}
                    </h3>

                    {/* Price */}
                    <div className="flex items-center gap-2 mb-4">
                        {product.price === 0 ? (
                            <p className="text-2xl font-bold text-yellow-600">Get Price</p>
                        ) : (
                            <>
                                <p className="text-2xl font-bold text-yellow-600">
                                    ₹{product.price.toLocaleString('en-IN')}
                                </p>
                                {product.cuttedPrice && product.cuttedPrice > product.price && (
                                    <p className="text-sm text-gray-400 line-through">
                                        ₹{product.cuttedPrice.toLocaleString('en-IN')}
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    {/* View Details Button */}
                    <Link
                        href={`/product/${product.slug}`}
                        className="block w-full text-center px-4 py-3 bg-slate-900 text-white font-semibold rounded-lg hover:bg-yellow-500 hover:text-slate-900 transition-all duration-300 shadow-md hover:shadow-lg"
                    >
                        View Details
                    </Link>
                </div>
            </div>
    );
};
