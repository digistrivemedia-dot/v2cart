import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiUrl } from "@/lib/utils/api";
import { WALLET_QUERY_KEYS } from "../keys";

/**
 * Requesting a withdrawal.
 *
 * One request. The server holds the money, creates the RazorpayX payout and
 * returns `processing` — settlement is confirmed later by a webhook, so the
 * UI must not present this as "money received". If the payout can't be
 * created the hold is released server-side and the balance is unchanged.
 */
const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const useWithdrawMutation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (amount: number) => {
      const response = await fetch(`${getApiUrl()}/withdrawals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ amount }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Withdrawal failed");
      }

      return data as { message: string; withdrawal: { status: string } };
    },
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Withdrawal failed");
      // The balance may have moved (a released hold), so re-read it.
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.all });
    },
  });

  return {
    withdraw: mutation.mutate,
    // Awaitable form, so a caller can report the server's own message instead
    // of guessing one — the same shape useValidateCoupon already exposes.
    withdrawAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
};
