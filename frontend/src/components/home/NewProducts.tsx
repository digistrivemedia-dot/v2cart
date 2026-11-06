"use server";

import Link from "next/link";
import { HomeProductCard } from "./HomeProductCard";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

async function getNewProducts() {
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

        console.log(`📦 Fetched ${products.length} total products for New Products`);

        // Filter products that have the 'new' tag
        const newProducts = products.filter((p: any) =>
            p.tags && Array.isArray(p.tags) && p.tags.includes('new')
        );

        console.log(`✨ Found ${newProducts.length} new products`);

        // Randomly shuffle and take 8 products — fall back to the most
        // recently added products when nothing is tagged 'new' yet (this is
        // literally what "new" means, so it doubles as the natural default).
        const selected = newProducts.length > 0
            ? newProducts.sort(() => 0.5 - Math.random()).slice(0, 8)
            : [...products].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);

        console.log(`✅ Selected ${selected.length} random new products`);

        return selected.map((product: any) => ({
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
        }));
    } catch (error) {
        console.error('Error fetching new products:', error);
        return [];
    }
}

export const NewProducts = async () => {
    const products = await getNewProducts();

    if (products.length === 0) {
        return (
            <section className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
                <div className="mb-4">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-800">
                        New Products
                    </h2>
                    <p className="text-xs text-slate-500">
                        Fresh arrivals and latest collections
                    </p>
                </div>
                <div className="text-center py-12 bg-slate-50 rounded-xl">
                    <p className="text-slate-600">No new products available yet. Add products with the &apos;new&apos; tag to see them here.</p>
                </div>
            </section>
        );
    }

    return (
        <section className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-800">
                        New Products
                    </h2>
                    <p className="text-xs text-slate-500">
                        Fresh arrivals and latest collections
                    </p>
                </div>
                <Link
                    href="/search?tags=new"
                    className="hidden md:block text-brand-blue hover:text-brand-blue-light font-semibold transition-colors"
                >
                    View All →
                </Link>
            </div>

            {/* Products Grid - 4 columns × 2 rows */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {products.map((product: any) => (
                    <HomeProductCard key={product._id} product={product} />
                ))}
            </div>

            {/* View All Mobile */}
            <div className="mt-8 text-center md:hidden">
                <Link
                    href="/search?tags=new"
                    className="inline-block px-8 py-3 bg-brand-gold hover:bg-brand-gold-light text-white font-semibold rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
                >
                    View All New Products
                </Link>
            </div>
        </section>
    );
};
