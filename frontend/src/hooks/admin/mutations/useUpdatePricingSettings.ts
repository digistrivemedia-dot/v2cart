import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiUrl } from "@/lib/utils/api";
import { ADMIN_QUERY_KEYS } from "../keys";
import type { PricingSettings } from "../queries/usePricingSettings";

export const useUpdatePricingSettings = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: PricingSettings) => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${getApiUrl()}/admin/pricing-settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to update pricing settings");
      }

      return result as { settings: PricingSettings; updatedCount: number; refundedCount: number; message: string };
    },
    onSuccess: (result) => {
      toast.success(result.message || "Pricing settings updated");
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.pricingSettings() });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update pricing settings"),
  });

  return {
    updateSettings: mutation.mutate,
    isPending: mutation.isPending,
  };
};
