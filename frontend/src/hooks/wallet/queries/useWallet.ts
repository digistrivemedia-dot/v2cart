import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/utils/api";
import { WALLET_QUERY_KEYS } from "../keys";

/**
 * The investor's wallet balances.
 *
 * Two buckets, because they answer different questions:
 *   capital  — deployable money: top-ups, returned principal, price refunds
 *   earnings — profit only, so "what have I made" needs no subtraction
 *
 * Both are withdrawable. See backend/models/walletModel.js.
 */
export type WalletBalances = {
  capital: number;
  earnings: number;
  pendingWithdrawal: number;
  withdrawable: number;
};

const EMPTY: WalletBalances = { capital: 0, earnings: 0, pendingWithdrawal: 0, withdrawable: 0 };

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const useWallet = () => {
  const query = useQuery({
    queryKey: WALLET_QUERY_KEYS.balance(),
    queryFn: async () => {
      const response = await fetch(`${getApiUrl()}/wallet`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load wallet");
      }

      return data.wallet as WalletBalances;
    },
    // The balance changes whenever the investor invests, so it must not serve
    // a stale number next to a "you have ₹X" prompt.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  return { ...query, wallet: query.data ?? EMPTY };
};
