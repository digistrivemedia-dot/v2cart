import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/utils/api";

const WITHDRAWALS_KEY = ["wallet", "withdrawals"] as const;

const authHeaders = () => {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : undefined;
};

export const useWithdrawals = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: WITHDRAWALS_KEY,
    queryFn: async () => {
      const response = await fetch(`${getApiUrl()}/wallet/withdrawals`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load withdrawals");
      }
      return data as { withdrawals: any[]; minWithdrawal: number };
    },
    staleTime: 30 * 1000,
  });

  return {
    ...query,
    withdrawals: query.data?.withdrawals ?? [],
    minWithdrawal: query.data?.minWithdrawal ?? 100,
    refetch: () => queryClient.invalidateQueries({ queryKey: WITHDRAWALS_KEY }),
  };
};
