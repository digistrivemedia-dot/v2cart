// Reads the signed-in user's session/wishlist via the auth cookie — must
// render per-request, not shared across users, so this stays dynamic
// intentionally.
export const dynamic = 'force-dynamic';
import Link from "next/link";
import { Suspense } from "react";
import { getUser } from "@/lib/auth/server";
import { SVGLoadingIcon } from "@/components/ui/loader";
import { WishlistProducts } from "@/components/wishlist";
import { getAllProducts } from "@/app/actions";
import { FiUser, FiArrowRight } from "react-icons/fi";

export async function generateMetadata() {
  return {
    title: "Wishlist | InveztIN",
    description: `Wishlist at e-commerce template made by Marcos Cámara`,
  };
}

const WishlistPage = async () => {
  const user = await getUser();

  if (user) {
    const allProducts = await getAllProducts();

    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-[calc(100vh-91px)]">
            <SVGLoadingIcon height={30} width={30} />
          </div>
        }
      >
        <WishlistProducts allProducts={allProducts} />
      </Suspense>
    );
  }

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center w-full bg-gray-50 px-4">
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 relative z-10">
          <FiUser className="w-8 h-8 text-slate-300" />
        </div>
        <div className="absolute inset-0 bg-slate-200 rounded-full blur-xl opacity-20 transform scale-150"></div>
      </div>

      <h1 className="mb-3 text-2xl md:text-3xl font-light text-slate-900 text-center tracking-tight">
        Please Login
      </h1>

      <p className="mb-10 text-slate-500 text-center max-w-md font-light text-lg leading-relaxed">
        Sign in to view your wishlist and save your favorite items for later.
      </p>

      <Link
        href="/login"
        className="group relative inline-flex items-center justify-center px-8 py-4 bg-slate-900 text-white text-sm font-medium tracking-wide transition-all duration-300 hover:bg-slate-800 hover:shadow-xl hover:-translate-y-0.5 rounded-full overflow-hidden"
      >
        <span className="relative z-10 flex items-center gap-2">
          Login Now
          <FiArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </span>
      </Link>
    </div>
  );
};

export default WishlistPage;
