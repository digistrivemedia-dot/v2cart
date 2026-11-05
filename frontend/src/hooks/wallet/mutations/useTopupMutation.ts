import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiUrl } from "@/lib/utils/api";
import { WALLET_QUERY_KEYS } from "../keys";

/**
 * Adding money to the wallet.
 *
 * Same two-step shape as the customer checkout: the server opens a Razorpay
 * order, the investor pays, and the server credits the wallet only after it
 * has re-verified the signature itself. The credited amount comes from the
 * gateway, never from this client — so nothing here can name its own balance.
 *
 * In PAYMENTS_MOCK mode the server returns a ready-made proof and there is no
 * gateway to open, so the whole flow is testable with no Razorpay account.
 */

type Proof = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function verify(proof: Proof) {
  const response = await fetch(`${getApiUrl()}/wallet/topup/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    credentials: "include",
    body: JSON.stringify(proof),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Could not add money to your wallet");
  }
  return data as { message: string; wallet: { capital: number; earnings: number } };
}

export const useTopupMutation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (amount: number) => {
      const orderResponse = await fetch(`${getApiUrl()}/wallet/topup/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ amount }),
      });

      const orderData = await orderResponse.json();
      if (!orderResponse.ok || !orderData.success) {
        throw new Error(orderData.message || "Could not start the top-up");
      }

      if (orderData.mock) {
        return verify(orderData.mockPayment);
      }

      // The `settled` guard mirrors the investment flow: Razorpay's SDK can
      // fire `handler` more than once, and `ondismiss` can fire straight
      // after a successful handler call.
      const proof = await new Promise<Proof>((resolve, reject) => {
        let settled = false;
        const razorpay = new (window as any).Razorpay({
          key: orderData.key_id,
          amount: orderData.order.amount,
          currency: orderData.order.currency,
          name: "Add money to wallet",
          description: `₹${amount.toLocaleString("en-IN")} to your investor wallet`,
          order_id: orderData.order.id,
          theme: { color: "#10b981" },
          handler: (response: Proof) => {
            if (settled) return;
            settled = true;
            resolve(response);
          },
          modal: {
            ondismiss: () => {
              if (settled) return;
              settled = true;
              reject(new Error("Top-up cancelled"));
            },
          },
        });
        razorpay.open();
      });

      return verify(proof);
    },
    onSuccess: (data) => {
      toast.success(data.message || "Money added to your wallet");
      queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.all });
    },
    onError: (error: Error) => {
      // The server refuses to credit the same gateway payment twice. If that
      // fires, the money is already in — don't tell them it failed.
      if (error.message?.toLowerCase().includes("already been credited")) {
        toast.success("That payment was already added to your wallet.");
        queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.all });
        return;
      }
      toast.error(error.message || "Could not add money to your wallet");
    },
  });

  return {
    topup: mutation.mutate,
    topupAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
};
