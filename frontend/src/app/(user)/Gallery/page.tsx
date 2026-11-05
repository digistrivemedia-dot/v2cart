// Public product gallery, not user-specific — cache it like the rest of the
// storefront instead of forcing a fresh backend round-trip on every visit.
import Image from 'next/image';
import Link from 'next/link';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';

async function getAllProducts() {
  try {
    const response = await fetch(`${API_BASE_URL}/products/all`, {
      next: { revalidate: 60 }, // Cache for 60 seconds, same as other product listings
      // Runs at build time for this statically-generated page — without a
      // timeout, an unreachable/misconfigured API_BASE_URL hangs instead of
      // failing fast, which can block the whole `next build` for 60s+.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error('Failed to fetch products');
      return [];
    }

    const data = await response.json();
    return data.success ? data.products : [];
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

export default async function GalleryPage() {
  const products = await getAllProducts();

  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-800 mb-4">
            Product Gallery
          </h1>
          <p className="text-lg text-slate-600">
            Browse our complete product collection
          </p>
        </div>

        {/* Image Grid */}
        {products.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm">
            <p className="text-slate-600 text-lg">No products available yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((product: any) => {
              const featuredImage = product.images?.find((img: any) => img.isFeatured);
              const imageUrl = featuredImage?.url || product.images?.[0]?.url || '/placeholder.jpg';

              return (
                <Link
                  key={product._id}
                  href={`/${product.category?.slug || 'products'}/${product._id}`}
                  className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100 hover:shadow-xl transition-all duration-300"
                >
                  <Image
                    src={imageUrl}
                    alt={product.name || 'Product'}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-500"
                    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  />

                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />

                  {/* Optional: Show product name on hover */}
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <p className="text-white font-medium text-sm line-clamp-2">
                      {product.name}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
