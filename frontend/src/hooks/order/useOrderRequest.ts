import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/utils/api";

/**
 * Cancellation and return requests — Phase 22.
 *
 * The customer asks, admin decides. Everything about WHAT may be asked for is
 * decided server-side (backend/utils/orderRequest.js) and arrives pre-resolved
 * in `useRequestOptions`, so these hooks never re-derive an eligibility rule
 * that could then disagree with the endpoint that enforces it.
 */

export type RequestType = "cancel" | "return";
export type RequestMode = "refund" | "replacement";
export type RequestStatus = "pending" | "approved" | "rejected";

export type RequestItem = {
  product: string;
  name: string;
  quantity: number;
  image?: string;
  /** False means it cannot be returned, and `reason` says why. */
  eligible: boolean;
  /** What this line may be asked for. Empty when ineligible. */
  modes: RequestMode[];
  reason?: string;
  closesAt?: string | null;
  policy?: "full" | "replacement_only" | "none";
};

export type OrderRequest = {
  _id: string;
  order: string;
  type: RequestType;
  mode: RequestMode | null;
  items: { product: string; name: string; quantity: number }[];
  reason: string;
  images: { public_id: string; url: string }[];
  status: RequestStatus;
  adminNote: string | null;
  decidedAt: string | null;
  createdAt: string;
};

type OptionsResponse = {
  success: boolean;
  /** Which button to show, if any — keyed on delivery, server-side. */
  allowedType: RequestType | null;
  closedReason: string | null;
  items: RequestItem[];
  request: OrderRequest | null;
  canRequest: boolean;
  maxImages: number;
};

const authHeaders = () => {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : undefined;
};

const optionsKey = (orderId: string) => ["order", orderId, "request-options"] as const;

/** What this customer may ask for on this order, and any existing request. */
export const useRequestOptions = (orderId: string | undefined) =>
  useQuery({
    queryKey: optionsKey(orderId || "none"),
    enabled: Boolean(orderId),
    queryFn: async (): Promise<OptionsResponse> => {
      const res = await fetch(`${getApiUrl()}/order/${orderId}/request`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Could not load your request options");
      }
      return data;
    },
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
  });

export const useCreateOrderRequest = (orderId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      type: RequestType;
      mode?: RequestMode | null;
      items?: string[];
      reason: string;
      /** base64 data URIs, as the product forms already send them. */
      images?: string[];
    }) => {
      const res = await fetch(`${getApiUrl()}/order/${orderId}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Could not send your request");
      }
      return data as { message: string; request: OrderRequest };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: optionsKey(orderId) });
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    },
  });
};

/* ────────────────────────────── admin side ────────────────────────────── */

const adminQueueKey = ["admin", "order-requests"] as const;

/**
 * The pending queue. Its `pendingOrderIds` is what lets the orders TABLE mark
 * its rows — a request living only inside one order's detail page is a request
 * nobody finds.
 */
export const useOrderRequests = (status?: RequestStatus) =>
  useQuery({
    queryKey: [...adminQueueKey, status ?? "all"],
    queryFn: async () => {
      const qs = status ? `?status=${status}` : "";
      const res = await fetch(`${getApiUrl()}/admin/order-requests${qs}`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Could not load requests");
      }
      return data as {
        requests: (OrderRequest & { user?: { name: string; email: string } })[];
        pendingCount: number;
        pendingOrderIds: string[];
      };
    },
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
  });

/** The request on one order, for the admin panel. */
export const useOrderRequestForOrder = (orderId: string | undefined) =>
  useQuery({
    queryKey: ["admin", "order", orderId, "request"],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/admin/order/${orderId}/request`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Could not load the request");
      }
      return (data.request || null) as
        | (OrderRequest & { user?: { name: string; email: string } })
        | null;
    },
    refetchOnWindowFocus: false,
  });

/**
 * Approve or reject.
 *
 * Approving is what actually moves money — it dispatches into the Phase 21
 * cancel/return/replace flows server-side — so the caller should confirm first.
 */
export const useDecideOrderRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      status,
      adminNote,
    }: {
      requestId: string;
      status: "approved" | "rejected";
      adminNote?: string;
    }) => {
      const res = await fetch(`${getApiUrl()}/admin/order-request/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ status, adminNote }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Could not record your decision");
      }
      return data as {
        message: string;
        request: OrderRequest;
        order: { orderStatus: string };
        refund?: { amount: number; refundId: string | null; error?: string };
        reversalFailures?: { product: string; error: string }[];
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueueKey });
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "settlements", "queue"] });
    },
  });
};
