// Reads the signed-in user's session/cart via the auth cookie — must render
// per-request, not shared across users, so this stays dynamic intentionally.
export const dynamic = 'force-dynamic';
import { Suspense } from "react";
import { getUser } from "@/lib/auth/server";
import { SVGLoadingIcon } from "@/components/ui/loader";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { redirect } from "next/navigation";

export async function generateMetadata() {
  return {
    title: "Checkout | InveztIN",
    description: `Complete your order at InveztIN`,
  };
}

const CheckoutPage = async () => {
  const user = await getUser();

  if (!user) {
    redirect('/login?redirect=/checkout');
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-[400px]">
              <SVGLoadingIcon height={30} width={30} />
            </div>
          }
        >
          <CheckoutForm />
        </Suspense>
      </div>
    </div>
  );
};

export default CheckoutPage;
