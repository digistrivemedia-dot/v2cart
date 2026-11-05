"use client";

/** FUNCTIONALITY */
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/client";
/** COMPONENTS */
import LoadingButton from "@/components/ui/loadingButton";
/** TYPES */
import type { CartItem } from "@/schemas";

interface ButtonCheckoutProps {
  cartItems: CartItem[];
}

export const ButtonCheckout = ({ cartItems }: ButtonCheckoutProps) => {
  const router = useRouter();
  const { data: session } = useSession();

  const handleCheckout = () => {
    if (!session?.user) {
      router.push('/login?redirect=/checkout');
      return;
    }

    router.push('/checkout');
  };

  return (
    <LoadingButton
      onClick={handleCheckout}
      className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-4 font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-200"
      loading={false}
    >
      Proceed to Checkout
    </LoadingButton>
  );
};
