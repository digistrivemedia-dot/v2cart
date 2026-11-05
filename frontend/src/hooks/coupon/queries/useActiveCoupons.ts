import { useQuery } from "@tanstack/react-query";
import { COUPON_QUERY_KEYS } from "../keys";
import { CouponSchema, type Coupon } from "@/schemas";
import { getApiUrl } from "@/lib/utils/api";

type ActiveCouponsResponse = {
  success: boolean;
  count: number;
  coupons: Coupon[];
};

export const useActiveCoupons = () => {
  const query = useQuery({
    queryKey: COUPON_QUERY_KEYS.activeCoupons(),
    queryFn: async () => {
      const response = await fetch(`${getApiUrl()}/active`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Error loading active coupons");
      }

      const data = await response.json();
      return {
        success: data.success,
        count: data.count,
        coupons: CouponSchema.array().parse(data.coupons),
      } as ActiveCouponsResponse;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    ...query,
    coupons: query.data?.coupons ?? [],
    count: query.data?.count ?? 0,
  };
};
