import { getAllProducts } from "@/app/actions";
import { pickFirst } from "@/utils";
import { FilterSidebar, ProductGrid, Breadcrumb } from "@/components/search";
import type { Metadata } from "next";
import type { ProductWithVariants } from "@/schemas";

export const metadata: Metadata = {
  title: "All Products - InveztIN",
  description: "Browse our complete collection of products.",
};

interface SearchProps {
  searchParams: Promise<{
    q?: string;
    category?: string | string[];
    subcategory?: string | string[];
    subsubcategory?: string | string[];
    tags?: string | string[];
    finish?: string | string[];
    color?: string | string[];
    size?: string | string[];
    minPrice?: string;
    maxPrice?: string;
    page?: string;
    limit?: string;
  }>;
}

const Search = async ({ searchParams }: SearchProps) => {
  const params = await searchParams;
  const q = pickFirst(params, "q");

  // Get pagination params
  const page = parseInt(params.page || '1');
  const limit = parseInt(params.limit || '12');

  // Get filter params
  const categories = params.category ? (Array.isArray(params.category) ? params.category : [params.category]) : [];
  // Also read subcategory and subsubcategory sent by navbar links
  const subcategories = params.subcategory ? (Array.isArray(params.subcategory) ? params.subcategory : [params.subcategory]) : [];
  const subsubcategories = params.subsubcategory ? (Array.isArray(params.subsubcategory) ? params.subsubcategory : [params.subsubcategory]) : [];
  const tags = params.tags ? (Array.isArray(params.tags) ? params.tags : [params.tags]) : [];
  const finishes = params.finish ? (Array.isArray(params.finish) ? params.finish : [params.finish]) : [];
  const colors = params.color ? (Array.isArray(params.color) ? params.color : [params.color]) : [];
  const sizes = params.size ? (Array.isArray(params.size) ? params.size : [params.size]) : [];
  const minPrice = params.minPrice ? parseFloat(params.minPrice) : undefined;
  const maxPrice = params.maxPrice ? parseFloat(params.maxPrice) : undefined;

  // Fetch ALL products (we'll filter client-side)
  const allProducts = await getAllProducts();

  // Fetch categories to get proper hierarchy. Unguarded, this threw the whole
  // page into the error boundary whenever the backend was unreachable — and
  // with a 1h cache it could also keep succeeding from cache while the
  // no-store product fetch returned [], making a dead backend look like a
  // genuinely empty catalogue. Degrade to a flat hierarchy instead.
  const dbCategories = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'}/categories`, {
    next: { revalidate: 3600 }, // categories rarely change
    signal: AbortSignal.timeout(8000),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => d?.categories || [])
    .catch((e) => {
      console.error('Search: failed to load categories', e);
      return [];
    });

  // Helper type for category tree nodes
  type CategoryNode = { slug: string; children?: CategoryNode[] };

  // Helper function to recursively get all descendant category slugs
  const getAllDescendantSlugs = (category: CategoryNode): string[] => {
    const slugs = [category.slug];
    if (category.children && category.children.length > 0) {
      category.children.forEach((child: CategoryNode) => {
        slugs.push(...getAllDescendantSlugs(child));
      });
    }
    return slugs;
  };

  // Build a slug map at ALL levels (parent, subcategory, sub-subcategory)
  // so that a slug passed at any level resolves correctly
  const categorySlugMap = new Map<string, string[]>();
  const buildSlugMap = (cat: CategoryNode) => {
    categorySlugMap.set(cat.slug, getAllDescendantSlugs(cat));
    if (cat.children) {
      cat.children.forEach((child: CategoryNode) => buildSlugMap(child));
    }
  };
  dbCategories.forEach((cat: CategoryNode) => buildSlugMap(cat));

  // Merge all selected category slugs from navbar params:
  // subsubcategory is most specific → subcategory next → category last
  // Use the most specific one that is present
  const allSelectedSlugs = [
    ...subsubcategories,
    ...subcategories,
    ...categories,
  ];

  // Client-side filtering
  let filteredProducts = allProducts;

  // Filter by search query — match against name, description, category slug/name, subcategory slug, and tags
  if (q) {
    const searchLower = q.toLowerCase();
    filteredProducts = filteredProducts.filter((product: ProductWithVariants) =>
      product.name?.toLowerCase().includes(searchLower) ||
      product.description?.toLowerCase().includes(searchLower) ||
      product.category?.toLowerCase().includes(searchLower) ||
      (product as any).categoryName?.toLowerCase().includes(searchLower) ||
      (product as any).subcategory?.toLowerCase().includes(searchLower) ||
      (product as any).subcategoryName?.toLowerCase().includes(searchLower) ||
      (product.tags && Array.isArray(product.tags) &&
        product.tags.some((t: string) => t.toLowerCase().includes(searchLower)))
    );
  }

  // Filter by categories — uses the merged slug list (handles navbar subcategory/subsubcategory clicks)
  if (allSelectedSlugs.length > 0) {
    filteredProducts = filteredProducts.filter((product: ProductWithVariants) => {
      return allSelectedSlugs.some(selectedSlug => {
        // 1. Check category hierarchy (normal case)
        if (product.category) {
          const slugsInHierarchy = categorySlugMap.get(selectedSlug) || [selectedSlug];
          if (slugsInHierarchy.includes(product.category)) return true;
        }

        // 2. Also check subcategory against the hierarchy
        const subcategory = (product as any).subcategory;
        if (subcategory) {
          const slugsInHierarchy = categorySlugMap.get(selectedSlug) || [selectedSlug];
          if (slugsInHierarchy.includes(subcategory)) return true;
        }

        const slugLower = selectedSlug.toLowerCase();

        // 3. Fallback: match against product.brand.name (brand is an object with name & logo)
        const brand = (product as any).brand;
        const brandName = brand?.name || (typeof brand === 'string' ? brand : '');
        if (brandName && brandName.toLowerCase() === slugLower) return true;

        // 4. Fallback: also try brand.name as slug (e.g. "Acme Co" → "acme-co")
        if (brandName) {
          const brandSlug = brandName.toLowerCase().replace(/\s+/g, '-');
          if (brandSlug === slugLower) return true;
        }

        return false;
      });
    });
  }

  // Filter by tags
  if (tags.length > 0) {
    filteredProducts = filteredProducts.filter((product: ProductWithVariants) =>
      product.tags && Array.isArray(product.tags) &&
      tags.some(tag => product.tags.map((t: string) => t.toLowerCase()).includes(tag.toLowerCase()))
    );
  }

  // Filter by finishes
  if (finishes.length > 0) {
    filteredProducts = filteredProducts.filter((product: ProductWithVariants) => {
      // Check base product finish
      if (product.finish && finishes.includes(product.finish)) return true;

      // Check variant finishes
      if (product.variants && product.variants.length > 0) {
        return product.variants.some((variant: { finish?: string }) =>
          variant.finish && finishes.includes(variant.finish)
        );
      }

      return false;
    });
  }

  // Filter by colors
  if (colors.length > 0) {
    filteredProducts = filteredProducts.filter((product: ProductWithVariants) => {
      // Check base product color
      if (product.color && colors.includes(product.color)) return true;

      // Check variant colors
      if (product.variants && product.variants.length > 0) {
        return product.variants.some((variant: { color?: string }) =>
          variant.color && colors.includes(variant.color)
        );
      }

      return false;
    });
  }

  // Filter by sizes — checks variant sizes AND the product-level size field
  if (sizes.length > 0) {
    filteredProducts = filteredProducts.filter((product: ProductWithVariants) => {
      // Check the product-level size field first
      const productSize = (product as any).size;
      if (productSize && sizes.includes(productSize)) return true;

      // Check variants for sizes
      if (product.variants && product.variants.length > 0) {
        return product.variants.some((variant: { size?: string; sizes?: string[] }) => {
          if (variant.size && sizes.includes(variant.size)) return true;
          if (variant.sizes && Array.isArray(variant.sizes)) {
            return variant.sizes.some((s: string) => sizes.includes(s));
          }
          return false;
        });
      }
      return false;
    });
  }

  // Filter by price range
  if (minPrice !== undefined || maxPrice !== undefined) {
    filteredProducts = filteredProducts.filter((product: ProductWithVariants) => {
      const price = product.price || 0;
      if (minPrice !== undefined && price < minPrice) return false;
      if (maxPrice !== undefined && price > maxPrice) return false;
      return true;
    });
  }

  // Resolve the page title from the most specific active category slug
  const findCategoryName = (cats: any[], slug: string): string | null => {
    for (const cat of cats) {
      if (cat.slug === slug) return cat.name;
      if (cat.children) {
        const found = findCategoryName(cat.children, slug);
        if (found) return found;
      }
    }
    return null;
  };
  let pageTitle = "All Products";
  for (const slug of allSelectedSlugs) {
    const name = findCategoryName(dbCategories, slug);
    if (name) { pageTitle = name; break; }
    // Fallback: if slug didn't match any category, use the slug itself as title (e.g. brand name)
    // Convert "godrej-ultra-lock" → "Godrej Ultra Lock"
    pageTitle = slug.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    break;
  }

  // Calculate pagination
  const totalProducts = filteredProducts.length;
  const totalPages = Math.ceil(totalProducts / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  const breadcrumbItems = [
    { label: "Products", href: "/search" },
    ...(q ? [{ label: q, href: `/search?q=${q}` }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <Breadcrumb items={breadcrumbItems} />

        {/* Main Content: Sidebar + Products */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filter Sidebar */}
          <FilterSidebar
            allProducts={allProducts}
            selectedCategories={categories}
            selectedTags={tags}
            selectedFinishes={finishes}
            selectedColors={colors}
            selectedSizes={sizes}
            minPrice={minPrice}
            maxPrice={maxPrice}
          />

          {/* Product Grid with Client-Side Filtered Products */}
          <ProductGrid
            products={paginatedProducts}
            totalProducts={totalProducts}
            totalPages={totalPages}
            currentPage={page}
            searchQuery={q}
            pageTitle={pageTitle}
          />
        </div>
      </div>
    </div>
  );
};

export default Search;
