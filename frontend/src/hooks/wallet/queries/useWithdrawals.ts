import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/utils/api";
import { WALLET_QUERY_KEYS } from "../keys";

export type Withdrawal = {
  _id: string;
  amount: number;
  fromEarnings: number;
  fromCapital: number;
  /** `processing` until RazorpayX settles it; then `paid` or `failed`. */
  status: "processing" | "paid" | "failed";
  payoutId?: string | null;
  /** Bank reference, quotable to the investor's bank once settled. */
  utr?: string | null;
  mode?: string | null;
  destination?: {
    type?: string | null;
    upiId?: string | null;
    accountLast4?: string | null;
    ifsc?: string | null;
  };
  failureReason?: string | null;
  createdAt: string;
  settledAt?: string | null;
};

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const useWithdrawals = () => {
  const query = useQuery({
    queryKey: [...WALLET_QUERY_KEYS.all, "withdrawals"],
    queryFn: async () => {
      const response = await fetch(`${getApiUrl()}/withdrawals`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load withdrawals");
      }

      return {
        withdrawals: data.withdrawals as Withdrawal[],
        minWithdrawal: Number(data.minWithdrawal) || 100,
      };
    },
    // A payout settles out of band, so a stale list would show "processing"
    // long after the money landed.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  return {
    ...query,
    withdrawals: query.data?.withdrawals ?? [],
    minWithdrawal: query.data?.minWithdrawal ?? 100,
  };
};
