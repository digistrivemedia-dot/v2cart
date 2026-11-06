import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/utils/api";

const WALLET_KEY = ["wallet"] as const;

const authHeaders = () => {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : undefined;
};

export type WalletData = {
  withdrawable: number;
  pendingWithdrawal: number;
};

export const useWallet = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: WALLET_KEY,
    queryFn: async () => {
      const response = await fetch(`${getApiUrl()}/wallet`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load wallet");
      }
      return data.wallet as WalletData;
    },
    staleTime: 30 * 1000,
  });

  return {
    ...query,
    wallet: query.data ?? null,
    refetch: () => queryClient.invalidateQueries({ queryKey: WALLET_KEY }),
  };
};
