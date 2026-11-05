import { useQuery } from "@tanstack/react-query";
import { COUPON_QUERY_KEYS } from "../keys";
import { CouponSchema, type Coupon } from "@/schemas";
import { getApiUrl } from "@/lib/utils/api";

type CouponsResponse = {
  success: boolean;
  count: number;
  coupons: Coupon[];
};

export const useCoupons = () => {
  const query = useQuery({
    queryKey: COUPON_QUERY_KEYS.list(),
    queryFn: async () => {
      const response = await fetch(`${getApiUrl()}/admin/coupons`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (!response.ok) {
        throw new Error("Error loading coupons");
      }

      const data = await response.json();

      console.log("Raw coupon data from API:", data);

      // Map the data to ensure all fields are present
      const mappedCoupons = data.coupons.map((coupon: any) => ({
        _id: coupon._id,
        code: coupon.code,
        description: coupon.description || undefined,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchaseAmount: coupon.minPurchaseAmount || 0,
        maxDiscountAmount: coupon.maxDiscountAmount || null,
        usageLimit: coupon.usageLimit || null,
        usageCount: coupon.usageCount || 0,
        perUserLimit: coupon.perUserLimit || 1,
        expiryDate: coupon.expiryDate,
        isActive: coupon.isActive ?? true,
        createdBy: coupon.createdBy,
        createdAt: coupon.createdAt,
        updatedAt: coupon.updatedAt,
      }));

      console.log("Mapped coupons:", mappedCoupons);

      return {
        success: data.success,
        count: data.count,
        coupons: mappedCoupons,
      } as CouponsResponse;
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
