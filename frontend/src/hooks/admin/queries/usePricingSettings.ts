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
  /**
   * The margin bands a product uses when admin sets none of its own. Unlike
   * marginPct these never touch a customer's price or a vendor's net — they
   * only decide what an investor earns, by how long their unit took to sell.
   */
  defaultMarginBands?: Record<"low" | "medium" | "high", { days: number; pct: number }>;
  /**
   * Phase 21 — the return rules a product falls back to, and so when the
   * vendor and the investor are paid. `full` is the only one that holds money.
   */
  defaultReturnPolicy?: "full" | "replacement_only" | "none";
  defaultReturnWindowDays?: number;
};

const DEFAULT_SETTINGS: PricingSettings = {
  marginPct: 0,
  gstPct: 0,
  // Mirrors DEFAULT_MARGIN_BANDS in backend/utils/marginBands.js, and only
  // used before the real settings land.
  defaultMarginBands: {
    low: { days: 10, pct: 5 },
    medium: { days: 15, pct: 10 },
    high: { days: 90, pct: 15 },
  },
  // Mirrors DEFAULT_RETURN_* in backend/utils/returnPolicy.js.
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
