import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiUrl } from "@/lib/utils/api";
import { ADMIN_QUERY_KEYS } from "../keys";

export type MarginBandsPayload = Record<"low" | "medium" | "high", { days: number; pct: number }>;

/**
 * The margin bands every product falls back to when admin sets none of its own,
 * which is the normal case — the approval panel shows these as the default and
 * admin only overrides them for a product needing different terms.
 *
 * Unlike the global margin, saving this moves no money and refunds nobody:
 * bands never touch a customer's price or a vendor's net, and an existing
 * investment settles against the bands snapshotted when it was made. It can
 * only affect investments made from here on.
 */
export const useUpdateDefaultMarginBands = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (defaultMarginBands: MarginBandsPayload) => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${getApiUrl()}/admin/default-margin-bands`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ defaultMarginBands }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to update default margin bands");
      }

      return result as { settings: any; requoted: number; message: string };
    },
    onSuccess: (result) => {
      toast.success(result.message || "Default margin bands updated");
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.pricingSettings() });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { updateBands: mutation.mutate, isPending: mutation.isPending };
};
