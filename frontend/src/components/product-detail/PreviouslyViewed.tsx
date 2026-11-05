"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface PreviouslyViewedProps {
  currentProductId: string;
}

export const PreviouslyViewed = ({ currentProductId }: PreviouslyViewedProps) => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchProducts = async () => {
      try {
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';
        // Only fetch 10 products instead of all
        const response = await fetch(`${API_BASE_URL}/products?limit=10`, {
          signal: abortController.signal
        });

        if (response.ok) {
          const data = await response.json();
          // Filter out current product and get up to 3 products
          const filteredProducts = (data.products || [])
            .filter((p: any) => p._id !== currentProductId)
            .slice(0, 3)
            .map((p: any) => ({
              id: p._id,
              name: p.name,
              price: p.price,
              rating: p.ratings || 0,
              image: p.images?.[0]?.url || '/placeholder.jpg',
              category: p.category?.slug || p.category,
            }));

          setProducts(filteredProducts);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('Fetch aborted');
        } else {
          console.error('Error fetching products:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();

    // Cleanup function to abort fetch if component unmounts
    return () => {
      abortController.abort();
    };
  }, [currentProductId]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Previously Viewed</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-gray-200 rounded-lg overflow-hidden animate-pulse">
              <div className="aspect-square bg-gray-200" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return null; // Don't show section if no products
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Previously Viewed</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <div key={product.id} className="group border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
            <Link href={`/${product.category}/${product.id}`} className="block">
              <div className="relative aspect-square bg-gray-100">
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            </Link>
            <div className="p-4">
              <Link href={`/${product.category}/${product.id}`}>
                <h3 className="font-semibold text-slate-800 mb-2 hover:text-orange-500 transition-colors line-clamp-2 min-h-[3rem]">
                  {product.name}
                </h3>
              </Link>
              <div className="flex items-center gap-1 mb-2">
                <div className="flex text-orange-400">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className={`w-4 h-4 ${i < Math.floor(product.rating) ? "fill-current" : "fill-gray-300"}`}
                      viewBox="0 0 20 20"
                    >
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                  ))}
                </div>
                <span className="text-xs text-gray-600">({product.rating})</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  {product.price > 0 ? (
                    <p className="text-xl font-bold text-orange-500">₹{product.price}</p>
                  ) : (
                    <>
                      <p className="text-lg font-bold text-blue-600">Get Price</p>
                      <p className="text-xs text-gray-500">Contact us</p>
                    </>
                  )}
                </div>
                <Link href={`/${product.category}/${product.id}`}>
                  <button className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-orange-500 transition-colors text-sm font-medium">
                    View Item
                  </button>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
