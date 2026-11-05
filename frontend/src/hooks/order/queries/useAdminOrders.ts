import { useQuery } from "@tanstack/react-query";
import { ORDER_QUERY_KEYS } from "../keys";
import { getApiUrl } from "@/lib/utils/api";

type AdminOrdersResponse = {
  success: boolean;
  orders: any[];
  totalAmount: number;
};

export const useAdminOrders = () => {
  const query = useQuery({
    queryKey: ORDER_QUERY_KEYS.adminList(),
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${getApiUrl()}/admin/orders`, {
        headers,
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to fetch orders");
      }

      return data as AdminOrdersResponse;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Order data changes as customers check out, but doesn't need a network
    // round-trip every time an admin tabs between /admin/* pages.
    staleTime: 2 * 60 * 1000,
  });

  return {
    ...query,
    orders: query.data?.orders ?? [],
    totalAmount: query.data?.totalAmount ?? 0,
  };
};
