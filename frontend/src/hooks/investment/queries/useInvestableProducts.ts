import { useQuery } from "@tanstack/react-query";
import { INVESTMENT_QUERY_KEYS } from "../keys";
import { getApiUrl } from "@/lib/utils/api";

export const useInvestableProducts = () => {
  const query = useQuery({
    queryKey: INVESTMENT_QUERY_KEYS.investableProducts(),
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${getApiUrl()}/investor/products`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load investable products");
      }

      return data.products as any[];
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60 * 1000,
  });

  return {
    ...query,
    products: query.data ?? [],
  };
};
