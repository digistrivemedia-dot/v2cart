import { useQuery } from "@tanstack/react-query";
import { ADMIN_QUERY_KEYS } from "../keys";
import { getApiUrl } from "@/lib/utils/api";

type Totals = {
  vendorPayouts: number;
  platformProfit: number;
};

export const useTransactionsSummary = (from?: string, to?: string) => {
  const query = useQuery({
    queryKey: ADMIN_QUERY_KEYS.transactionsSummary(from, to),
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();

      const response = await fetch(`${getApiUrl()}/admin/transactions/summary${qs ? `?${qs}` : ""}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load report");
      }

      return data as { totals: Totals; breakdown: { _id: string; total: number; count: number }[] };
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60 * 1000,
  });

  return {
    ...query,
    totals: query.data?.totals ?? {
      vendorPayouts: 0,
      platformProfit: 0,
    },
    breakdown: query.data?.breakdown ?? [],
  };
};
