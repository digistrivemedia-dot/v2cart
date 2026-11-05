import { useQuery } from "@tanstack/react-query";
import { VENDOR_QUERY_KEYS } from "../keys";
import { getApiUrl } from "@/lib/utils/api";

type VendorStats = {
  productCount: number;
  liveCount: number;
  pendingApprovalCount: number;
  unitsSold: number;
  lifetimeIncome: number;
  /**
   * Phase 21 — sold units whose money has not been released yet, because the
   * customer can still return them. `vendor_earning` is only written at
   * maturation, so "sold" and "paid" are now different states.
   */
  pendingIncome?: number;
  pendingUnits?: number;
  /** Of those, units on orders not yet marked delivered — clock not started. */
  awaitingDelivery?: number;
  nextReleaseAt?: string | null;
};

export const useVendorStats = () => {
  const query = useQuery({
    queryKey: VENDOR_QUERY_KEYS.stats(),
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${getApiUrl()}/vendor/stats`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load stats");
      }

      return data.stats as VendorStats;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60 * 1000,
  });

  return {
    ...query,
    stats: query.data ?? {
      productCount: 0,
      liveCount: 0,
      pendingApprovalCount: 0,
      unitsSold: 0,
      lifetimeIncome: 0,
      pendingIncome: 0,
      pendingUnits: 0,
      awaitingDelivery: 0,
      nextReleaseAt: null,
    },
  };
};
