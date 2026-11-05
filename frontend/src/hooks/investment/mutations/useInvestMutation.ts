import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiUrl } from "@/lib/utils/api";
import { INVESTMENT_QUERY_KEYS } from "../keys";
import { WALLET_QUERY_KEYS } from "@/hooks/wallet";

/**
 * Placing an investment.
 *
 * Funded from the investor's wallet, so this is now a single request with no
 * payment step at all: no Razorpay order, no checkout modal, no signature to
 * forward. The server debits `capital` and writes the units in one
 * transaction, which is also what makes two simultaneous submissions unable
 * to spend the same balance.
 *
 * The old flow opened Razorpay per investment and handed the proof back for
 * re-verification. That whole path is gone — and the server deliberately
 * REJECTS any request still carrying `razorpay_payment_id`, because such a
 * request would be charged by the gateway *and* debited from the wallet. If
 * you see "Investments are funded from your wallet now", something is still
 * sending payment proof.
 *
 * Topping the wallet up is a separate, explicit action — see
 * hooks/wallet/useTopupMutation.
 */

export interface InvestCartLine {
  productId: string;
  quantity: number;
}

interface InvestArgs {
  items: InvestCartLine[];
}

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const useInvestMutation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ items }: InvestArgs) => {
      const response = await fetch(`${getApiUrl()}/investor/invest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ items }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to place investment");
      }

      return data.investments as unknown[];
    },
    onSuccess: (investments) => {
      toast.success(
        `${investments.length} investment${investments.length > 1 ? "s" : ""} placed from your wallet.`
      );
      queryClient.invalidateQueries({ queryKey: INVESTMENT_QUERY_KEYS.mine() });
      queryClient.invalidateQueries({ queryKey: INVESTMENT_QUERY_KEYS.earnings() });
      queryClient.invalidateQueries({ queryKey: INVESTMENT_QUERY_KEYS.investableProducts() });
      // The balance just moved, and it's on screen.
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to place investment");
      // A rejected investment may still have been a stale-balance problem, so
      // refresh what the wallet actually holds.
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.all });
    },
  });

  return {
    invest: mutation.mutate,
    investAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
};
