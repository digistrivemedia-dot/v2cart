import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/utils/api";

/**
 * Money held inside return windows — MARKETPLACE_CONVERSION_PLAN.md Phase 21.
 *
 * Two lists, and the second is the one that matters operationally:
 *
 *   holding              sold lines waiting out their window, with release dates
 *   awaitingDeliveryMark shipped orders nobody has marked Delivered
 *
 * `deliveredAt` is set by a manual admin status change, and the return clock
 * starts there. An order that is never marked delivered therefore never
 * matures and never pays its vendor or investor — a silent non-payment whose
 * only symptom is an entry in that second list.
 */

export type HeldLine = {
  order: string;
  customer: string | null;
  product: string;
  name: string;
  quantity: number;
  returnPolicy: "full" | "replacement_only" | "none";
  returnWindowDays: number;
  deliveredAt: string | null;
  maturesAt: string;
  due: boolean;
  fundedUnits: number;
};

export type AwaitingDeliveryMark = {
  order: string;
  customer: string | null;
  shippedAt: string | null;
  daysSinceShipped: number | null;
  totalPrice: number;
};

type QueueResponse = {
  success: boolean;
  holding: HeldLine[];
  dueNow: number;
  awaitingDeliveryMark: AwaitingDeliveryMark[];
};

const authHeaders = () => {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : undefined;
};

const QUEUE_KEY = ["admin", "settlements", "queue"] as const;

export const useSettlementQueue = () => {
  const query = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: async () => {
      const response = await fetch(`${getApiUrl()}/admin/settlements/queue`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const data: QueueResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error((data as any).message || "Failed to load the settlement queue");
      }
      return data;
    },
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
  });

  return {
    ...query,
    holding: query.data?.holding ?? [],
    dueNow: query.data?.dueNow ?? 0,
    awaitingDeliveryMark: query.data?.awaitingDeliveryMark ?? [],
  };
};

/**
 * Release everything whose window has closed.
 *
 * The same `matureDue()` the daily cron calls, so this is a fallback for a
 * cron that did not fire rather than a second code path — and the only way to
 * exercise a 7-day window without waiting a week.
 */
export const useReleaseDuePayouts = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${getApiUrl()}/admin/settlements/mature`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to release payouts");
      }
      return data as {
        message: string;
        itemsSettled: number;
        investorsPaid: number;
        paidOut: number;
        errors: { order: string; product: string; error: string }[];
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
      queryClient.invalidateQueries({ queryKey: ["admin", "transactions"] });
    },
  });
};
