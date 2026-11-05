"use server";

import { revalidatePath } from "next/cache";
import type { ProductCategory } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';
// These functions run at build time for statically-generated pages. If
// NEXT_PUBLIC_API_BASE_URL isn't set in the deploy environment, the fallback
// above points nowhere reachable — without a timeout, that fetch can hang
// instead of failing fast, which blocks the whole `next build` for 60s+ per
// page until Vercel kills the build. 8s is generous for a real backend and
// short enough to never stall a build.
const FETCH_TIMEOUT_MS = 8000;

// Helper function to transform backend product to frontend format
function transformProduct(backendProduct: any) {
  // Get the featured image or first image
  const featuredImage = backendProduct.images?.find((img: any) => img.isFeatured);
  const mainImage = featuredImage || backendProduct.images?.[0];

  // Transform variants - use real variants if available, otherwise create default
  let variants = [];
  if (backendProduct.hasVariants && backendProduct.variants && backendProduct.variants.length > 0) {
    variants = backendProduct.variants.map((variant: any) => {
      // Prefer the variant's own size, then fall back to the product-level size string
      const variantSize = variant.size || backendProduct.size || '';
      return {
        productId: variant.productId || backendProduct.productId,
        color: variant.color || backendProduct.color || 'Default',
        size: variantSize,
        sizes: variantSize ? [variantSize] : [],
        finish: variant.finish || backendProduct.finish,
        price: variant.price || backendProduct.price,
        stock: variant.stock !== undefined ? variant.stock : backendProduct.stock,
        // Use variant's own images; fallback to product images if variant has none
        images: variant.images && variant.images.length > 0 ? variant.images : backendProduct.images || []
      };
    });
  } else {
    // Create default variant from product-level data
    const productSize = backendProduct.size || '';
    variants = [{
      productId: backendProduct.productId,
      color: backendProduct.color || 'Default',
      size: productSize,
      sizes: productSize ? [productSize] : [],
      finish: backendProduct.finish,
      price: backendProduct.price,
      stock: backendProduct.stock,
      images: backendProduct.images || []
    }];
  }

  return {
    id: backendProduct._id,
    name: backendProduct.name,
    description: backendProduct.description,
    shortDescription: backendProduct.shortDescription,
    price: backendProduct.price,
    cuttedPrice: backendProduct.cuttedPrice,
    category: backendProduct.category?.slug || backendProduct.category,
    categoryName: backendProduct.category?.name || backendProduct.category,
    subcategory: backendProduct.subcategory?.slug || backendProduct.subcategory,
    subcategoryName: backendProduct.subcategory?.name,
    img: mainImage?.url || '/placeholder.jpg',
    images: backendProduct.images || [],
    stock: backendProduct.stock,
    ratings: backendProduct.ratings || 0,
    numOfReviews: backendProduct.numOfReviews || 0,
    productId: backendProduct.productId,
    size: backendProduct.size,
    material: backendProduct.material,
    finish: backendProduct.finish,
    color: backendProduct.color,
    highlights: backendProduct.highlights || [],
    careInstructions: backendProduct.careInstructions || [],
    specifications: backendProduct.specifications || [],
    tags: backendProduct.tags || [],
    hasVariants: backendProduct.hasVariants || false,
    variants: variants,
    // Phase 21 — what the customer can do if the product is wrong, and for how
    // long. Resolved by the backend (a product on the platform default still
    // reports the real window), so this is display-ready.
    returnPolicy: backendProduct.returnPolicy,
    returnWindowDays: backendProduct.returnWindowDays,
    returnPolicyLabel: backendProduct.returnPolicyLabel,
  };
}

// Fetch products from backend API

export async function getAllProducts() {
  try {
    // NOTE: cache: 'no-store' is intentional — the response is >2MB and Next.js
    // cannot cache it anyway (logs a warning). Using revalidate would serve stale
    // data from an old cache entry. no-store guarantees fresh data every request.
    const response = await fetch(`${API_BASE_URL}/products/all`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error('Failed to fetch products:', response.statusText);
      return [];
    }

    const data = await response.json();
    const products = data.success ? data.products : [];
    return products.map(transformProduct);
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

// Fetch products with server-side pagination
export async function getProductsWithPagination(params: {
  page?: number;
  limit?: number;
  keyword?: string;
  category?: string;
  subcategory?: string;
  minPrice?: number;
  maxPrice?: number;
}) {
  try {
    const {
      page = 1,
      limit = 12,
      keyword,
      category,
      subcategory,
      minPrice,
      maxPrice
    } = params;

    // Build query string
    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('limit', limit.toString());
    if (keyword) queryParams.append('keyword', keyword);
    if (category) queryParams.append('category', category);
    if (subcategory) queryParams.append('subcategory', subcategory);
    if (minPrice !== undefined) queryParams.append('price[gte]', minPrice.toString());
    if (maxPrice !== undefined) queryParams.append('price[lte]', maxPrice.toString());

    const url = `${API_BASE_URL}/products?${queryParams.toString()}`;
    console.log('🔍 Fetching products:', url);
    console.log('📊 Params - Page:', page, 'Limit:', limit);

    const response = await fetch(url, {
      cache: 'no-store', // Disable cache for debugging
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error('Failed to fetch products:', response.statusText);
      return {
        products: [],
        totalProducts: 0,
        totalPages: 0,
        currentPage: page,
        productsPerPage: limit
      };
    }

    const data = await response.json();

    if (!data.success) {
      return {
        products: [],
        totalProducts: 0,
        totalPages: 0,
        currentPage: page,
        productsPerPage: limit
      };
    }

    const products = data.products.map(transformProduct);
    const totalProducts = data.filteredProductsCount || data.productsCount || 0;
    const totalPages = Math.ceil(totalProducts / limit);

    console.log('✅ Backend Response:', {
      receivedProducts: data.products.length,
      totalProducts,
      totalPages,
      resultPerPage: data.resultPerPage
    });

    return {
      products,
      totalProducts,
      totalPages,
      currentPage: page,
      productsPerPage: limit
    };
  } catch (error) {
    console.error('Error fetching products with pagination:', error);
    return {
      products: [],
      totalProducts: 0,
      totalPages: 0,
      currentPage: params.page || 1,
      productsPerPage: params.limit || 12
    };
  }
}

export async function getCategoryProducts(category: ProductCategory) {
  try {
    const response = await fetch(`${API_BASE_URL}/products?category=${category}`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error('Failed to fetch category products:', response.statusText);
      return [];
    }

    const data = await response.json();
    const products = data.success ? data.products : [];
    return products.map(transformProduct);
  } catch (error) {
    console.error('Error fetching category products:', error);
    return [];
  }
}

export async function getProduct(productId: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/product/${productId}`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error('Failed to fetch product:', response.statusText);
      return null;
    }

    const data = await response.json();
    return data.success ? transformProduct(data.product) : null;
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

export async function getRandomProducts(limit: number = 4) {
  try {
    // Fetch random products from backend instead of fetching all and shuffling
    const response = await fetch(`${API_BASE_URL}/products/random?limit=${limit}`, {
      next: { revalidate: 60 }, // Cache for 1 minute
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Fallback to old method if backend doesn't support random endpoint
      console.warn('Random endpoint not available, falling back to client-side shuffle');
      const allProducts = await getAllProducts();
      const shuffled = [...allProducts].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, limit);
    }

    const data = await response.json();
    const products = data.success ? data.products : [];
    return products.map(transformProduct);
  } catch (error) {
    console.error('Error fetching random products:', error);
    return [];
  }
}

export async function searchProducts(query: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/products?keyword=${encodeURIComponent(query)}`, {
      next: { revalidate: 30 }, // Cache search results for 30 seconds
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error('Failed to search products:', response.statusText);
      return [];
    }

    const data = await response.json();
    const products = data.success ? data.products : [];
    return products.map(transformProduct);
  } catch (error) {
    console.error('Error searching products:', error);
    return [];
  }
}

export async function revalidateProducts(productId?: string) {
  // Only revalidate pages that actually show product data
  // DO NOT use revalidatePath('/', 'layout') — that nukes every page in the app
  revalidatePath('/');          // home page
  revalidatePath('/search');    // search/browse page
  return { success: true };
}
