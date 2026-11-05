"use client";

import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/utils/api";

/**
 * The GST rate, from the one place it is configured.
 *
 * Its own unauthenticated endpoint because a guest totalling up a cart needs
 * it, and because a tax rate on every invoice is not a secret — unlike
 * `marginPct`, which only `usePricingSettings` (vendor/admin) returns.
 *
 * It was hardcoded as `* 0.18` in the cart, the checkout form and the mobile
 * app independently. Four copies of a tax rate is three chances to miss one.
 */
export const TAX_QUERY_KEY = ["public", "tax-settings"] as const;

export const useTaxSettings = () => {
  const query = useQuery({
    queryKey: TAX_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch(`${getApiUrl()}/pricing-settings`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load tax settings");
      }

      return { gstPct: Number(data.gstPct) || 0 };
    },
    // The rate changes rarely; re-asking on every mount is pointless.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    ...query,
    // Falling back to 0 rather than 18 on failure is deliberate: a wrong tax
    // line is worse than a missing one, and the backend recomputes order
    // totals server-side regardless of what the page displayed.
    gstPct: query.data?.gstPct ?? 0,
    gstRate: (query.data?.gstPct ?? 0) / 100,
  };
};
