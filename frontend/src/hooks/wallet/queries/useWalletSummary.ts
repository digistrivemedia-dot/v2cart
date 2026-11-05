import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/utils/api";
import { WALLET_QUERY_KEYS } from "../keys";

/**
 * Where the money came from and where it went.
 *
 * The balances say what is left; this says how it got there. Both are summed
 * from the same ledger the statement renders, so the three always agree.
 */
export type WalletSummary = {
  inflow: {
    topups: number;
    profit: number;
    refunds: number;
    principalReturned: number;
    openingBalance: number;
  };
  outflow: {
    invested: number;
    withdrawn: number;
    heldForWithdrawal: number;
    profitReversed: number;
    principalRedeployed: number;
  };
  totalIn: number;
  totalOut: number;
  counts: {
    topups: number;
    investments: number;
    unitsFunded: number;
    salesSettled: number;
    refunds: number;
    /** Paid out. Pending and failed are counted separately. */
    withdrawals: number;
    withdrawalsPending: number;
    withdrawalsFailed: number;
  };
};

/** One product's money movement, so "which products paid me" is answerable. */
export type WalletProductRow = {
  product: string;
  name: string | null;
  image?: string;
  invested: number;
  unitsFunded: number;
  profit: number;
  refunded: number;
  principalReturned: number;
};

const EMPTY: WalletSummary = {
  inflow: { topups: 0, profit: 0, refunds: 0, principalReturned: 0, openingBalance: 0 },
  outflow: { invested: 0, withdrawn: 0, heldForWithdrawal: 0, profitReversed: 0, principalRedeployed: 0 },
  totalIn: 0,
  totalOut: 0,
  counts: {
    topups: 0,
    investments: 0,
    unitsFunded: 0,
    salesSettled: 0,
    refunds: 0,
    withdrawals: 0,
    withdrawalsPending: 0,
    withdrawalsFailed: 0,
  },
};

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const useWalletSummary = () => {
  const query = useQuery({
    queryKey: [...WALLET_QUERY_KEYS.all, "summary"],
    queryFn: async () => {
      const response = await fetch(`${getApiUrl()}/wallet/summary`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load wallet summary");
      }

      return {
        summary: data.summary as WalletSummary,
        byProduct: data.byProduct as WalletProductRow[],
      };
    },
    staleTime: 0,
    retry: 1,
  });

  return {
    ...query,
    summary: query.data?.summary ?? EMPTY,
    byProduct: query.data?.byProduct ?? [],
  };
};
