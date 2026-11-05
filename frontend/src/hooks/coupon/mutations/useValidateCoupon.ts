import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ValidateCoupon } from "@/schemas";
import { getApiUrl } from "@/lib/utils/api";

type ValidateCouponResponse = {
  success: boolean;
  valid: boolean;
  coupon: {
    code: string;
    description?: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    discount: number;
    finalAmount: number;
    // Phase 23 — the server prices the cart and returns every figure, so the
    // checkout displays these instead of recomputing a total that could
    // disagree with the one /order/new verifies the payment against.
    itemsPrice?: number;
    taxPrice?: number;
    shippingPrice?: number;
    /** True when the coupon was worth more than the cart's margin allowed. */
    capped?: boolean;
    capped_to?: number | null;
  };
};

export const useValidateCoupon = () => {
  const mutation = useMutation({
    mutationFn: async (data: ValidateCoupon) => {
      const response = await fetch(`${getApiUrl()}/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || "Invalid coupon code";
        throw new Error(errorMessage);
      }

      return (await response.json()) as ValidateCouponResponse;
    },
    onError: (error: Error) => {
      console.error("Error validating coupon:", error);
      toast.error(error.message || "Invalid coupon code");
    },
  });

  return {
    validate: mutation.mutate,
    validateAsync: mutation.mutateAsync,
    isValidating: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
  };
};
