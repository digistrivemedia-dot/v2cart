"use server";

import Link from "next/link";
import { HomeProductCard } from "./HomeProductCard";

// Temporary dummy data — remove once real products are tagged 'popular' in the DB
const DUMMY_PRODUCTS = [
  { _id: "d1", name: "Samsung Galaxy S24 5G", category: "Mobiles",     image: "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400", price: 74999, cuttedPrice: 89999, slug: "samsung-galaxy-s24" },
  { _id: "d2", name: "boAt Rockerz 450 Bluetooth Headphones", category: "Electronics", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400", price: 1499,  cuttedPrice: 2999,  slug: "boat-rockerz-450" },
  { _id: "d3", name: "Apple Watch Series 9", category: "Electronics",  image: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=400", price: 39900, cuttedPrice: 45900, slug: "apple-watch-series-9" },
  { _id: "d4", name: "Nike Running Shoes", category: "Fashion",        image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400", price: 4499,  cuttedPrice: 7999,  slug: "nike-running-shoes" },
  { _id: "d5", name: "Portable Power Bank 20000mAh", category: "Electronics", image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400", price: 1299,  cuttedPrice: 1999,  slug: "power-bank-20000" },
];

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

    const displayProducts = products.length > 0 ? products : DUMMY_PRODUCTS;

    return (
        <section className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
            {/* Section header */}
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-800">Deal of the Day</h2>
                    <p className="text-xs text-slate-500">Limited time offers on top products</p>
                </div>
                <Link
                    href="/search?tags=popular"
                    className="text-brand-blue hover:text-brand-blue-light text-sm font-semibold transition-colors"
                >
                    View All →
                </Link>
            </div>

            {/* Products grid — 2 cols mobile, 4–5 cols desktop */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {displayProducts.map((product: any) => (
                    <HomeProductCard key={product._id} product={product} />
                ))}
            </div>
        </section>
    );
};
