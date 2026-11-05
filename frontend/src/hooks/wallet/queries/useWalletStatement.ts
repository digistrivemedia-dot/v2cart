import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/utils/api";
import { WALLET_QUERY_KEYS } from "../keys";

/** One movement of money into or out of a bucket. */
export type WalletRow = {
  _id: string;
  bucket: "capital" | "earnings";
  type:
    | "topup"
    | "investment"
    | "principal_returned"
    | "profit"
    | "refund"
    | "withdrawal_hold"
    | "withdrawal_paid"
    | "withdrawal_released"
    | "profit_reversal"
    | "principal_reversal"
    | "opening_balance"
    | "adjustment";
  amount: number;
  /** The bucket's balance right after this row — stored, not recomputed. */
  balanceAfter: number;
  /** Units this row covers: 1 for a per-unit move, N for a funded batch. */
  quantity?: number | null;
  product?: { _id: string; name: string } | null;
  /** Populated on withdrawal rows, so a hold can read as paid once settled. */
  withdrawal?: { _id: string; status: "processing" | "paid" | "failed"; utr?: string | null } | null;
  reference?: string | null;
  note?: string | null;
  createdAt: string;
};

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const useWalletStatement = (bucket?: "capital" | "earnings") => {
  const query = useQuery({
    queryKey: WALLET_QUERY_KEYS.statement(bucket),
    queryFn: async () => {
      const qs = bucket ? `?bucket=${bucket}&limit=100` : "?limit=100";
      const response = await fetch(`${getApiUrl()}/wallet/statement${qs}`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load statement");
      }

      return data.rows as WalletRow[];
    },
    staleTime: 0,
    retry: 1,
  });

  return { ...query, rows: query.data ?? [] };
};
