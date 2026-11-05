// Not user-specific — every section below already caches its own fetch with
// `next: { revalidate: N }`. Do not add `force-dynamic` here; it overrides
// those per-fetch cache hints and forces a full backend round-trip on every
// single visit to the home page.
import {
  HeroSlider,
  PopularProducts,
  TrendingProducts,
  NewProducts,
  PremiumProducts,
  ExclusiveProducts,
  ClassicProducts,
  BestSeller,
  LimitedEdition,
  BlogSection,
  // Testimonials, // Temporarily disabled - will add back later
} from "@/components/home";

const Home = async () => {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero Slider */}
      <HeroSlider />

      {/* Popular Products */}
      <PopularProducts />

      {/* Trending Products */}
      <TrendingProducts />

      {/* New Products */}
      <NewProducts />

      {/* Premium Products */}
      <PremiumProducts />

      {/* Exclusive Products */}
      <ExclusiveProducts />

      {/* Classic Products */}
      <ClassicProducts />

      {/* Best Seller Products */}
      <BestSeller />

      {/* Limited Edition Products */}
      <LimitedEdition />

      {/* Blog Section */}
      <BlogSection />

      {/* Testimonials - Temporarily disabled */}
      {/* <Testimonials /> */}
    </main>
  );
};

export default Home;
