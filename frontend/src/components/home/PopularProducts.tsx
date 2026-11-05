"use server";

import Link from "next/link";
import { HomeProductCard } from "./HomeProductCard";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

async function getPopularProducts() {
    try {
        // Fetch all products
        const response = await fetch(`${API_BASE_URL}/products/all`, {
            next: { revalidate: 300 }, // Cache for 5 minutes
        });

        if (!response.ok) {
            console.error('Failed to fetch products');
            return [];
        }

        const result = await response.json();
        const products = result.products || [];

        console.log(`📦 Fetched ${products.length} total products for Popular Products`);

        // Filter products that have the 'popular' tag
        const popularProducts = products.filter((p: any) =>
            p.tags && Array.isArray(p.tags) && p.tags.includes('popular')
        );

        console.log(`⭐ Found ${popularProducts.length} popular products`);

        // Randomly shuffle and take 8 products — fall back to the
        // best-rated products when nothing is tagged 'popular' yet, so the
        // homepage isn't empty just because tags haven't been set.
        const selected = popularProducts.length > 0
            ? popularProducts.sort(() => 0.5 - Math.random()).slice(0, 8)
            : [...products].sort((a: any, b: any) => {
                const ratingDiff = (b.ratings || 0) - (a.ratings || 0);
                return ratingDiff !== 0 ? ratingDiff : (b.numOfReviews || 0) - (a.numOfReviews || 0);
              }).slice(0, 8);

        console.log(`✅ Selected ${selected.length} random popular products`);

        // Debug: Log first product to see available data
        if (selected.length > 0) {
            console.log('🔍 Sample product data:', selected[0]);
            console.log('🔍 Has stripeId?', selected[0].stripeId);
            console.log('🔍 Has variants?', selected[0].variants);
        }

        return selected.map((product: any) => {
            const mappedProduct = {
                _id: product._id,
                name: product.name,
                category: product.category?.name || 'General',
                image: product.images?.[0]?.url || '/placeholder.jpg',
                price: product.price,
                cuttedPrice: product.cuttedPrice,
                slug: product.slug || product._id,
                hasVariants: product.variants && product.variants.length > 1,
                variantId: product.variants?.[0]?.id || product.id,
                stripeId: product.stripeId || product.variants?.[0]?.stripeId,
                size: product.size || 'default',
                variants: product.variants || [],
            };

            // Debug: Log if product should show Add to Cart
            if (mappedProduct.price > 0) {
                console.log(`🛒 Product "${mappedProduct.name}":`, {
                    price: mappedProduct.price,
                    hasVariants: mappedProduct.hasVariants,
                    stripeId: mappedProduct.stripeId,
                    shouldShowCart: mappedProduct.price > 0 && !mappedProduct.hasVariants && !!mappedProduct.stripeId
                });
            }

            return mappedProduct;
        });
    } catch (error) {
        console.error('Error fetching popular products:', error);
        return [];
    }
}

export const PopularProducts = async () => {
    const products = await getPopularProducts();

    if (products.length === 0) {
        return (
            <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto bg-white">
                <div className="mb-12">
                    <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-3">
                        Popular Products
                    </h2>
                    <p className="text-slate-600 text-lg">
                        Customer favorites and best-sellers
                    </p>
                </div>
                <div className="text-center py-12 bg-slate-50 rounded-2xl">
                    <p className="text-slate-600">No popular products available yet. Add products with the 'popular' tag to see them here.</p>
                </div>
            </section>
        );
    }

    return (
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto bg-white">
            {/* Header */}
            <div className="flex justify-between items-end mb-12">
                <div>
                    <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-3">
                        Popular Products
                    </h2>
                    <p className="text-slate-600 text-lg">
                        Customer favorites and best-sellers
                    </p>
                </div>
                <Link
                    href="/search?tags=popular"
                    className="hidden md:block text-yellow-500 hover:text-yellow-600 font-semibold transition-colors"
                >
                    View All →
                </Link>
            </div>

            {/* Products Grid - 4 columns × 2 rows */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {products.map((product: any) => (
                    <HomeProductCard key={product._id} product={product} />
                ))}
            </div>

            {/* View All Mobile */}
            <div className="mt-8 text-center md:hidden">
                <Link
                    href="/search?tags=popular"
                    className="inline-block px-8 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
                >
                    View All Popular Products
                </Link>
            </div>
        </section>
    );
};
