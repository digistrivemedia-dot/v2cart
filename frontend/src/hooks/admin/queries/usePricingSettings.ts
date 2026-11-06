import { useQuery } from "@tanstack/react-query";
import { ADMIN_QUERY_KEYS } from "../keys";
import { getApiUrl } from "@/lib/utils/api";

// The global margin carved out of each vendor's listing price, plus the GST
// added on top of it at checkout — see MARKETPLACE_CONVERSION_PLAN.md Phase 10.
//
// Readable by vendors as well as admins: the vendor product form needs
// marginPct to show a vendor what they will actually receive.
export type PricingSettings = {
  marginPct: number;
  gstPct: number;
  defaultReturnPolicy?: "full" | "replacement_only" | "none";
  defaultReturnWindowDays?: number;
};

const DEFAULT_SETTINGS: PricingSettings = {
  marginPct: 0,
  gstPct: 0,
  defaultReturnPolicy: "full",
  defaultReturnWindowDays: 7,
};

export const usePricingSettings = () => {
  const query = useQuery({
    queryKey: ADMIN_QUERY_KEYS.pricingSettings(),
    queryFn: async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const response = await fetch(`${getApiUrl()}/admin/pricing-settings`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load pricing settings");
      }

      return data.settings as PricingSettings;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    staleTime: 60 * 1000,
  });

  return {
    ...query,
    settings: query.data ?? DEFAULT_SETTINGS,
  };
};
