import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { COUPON_QUERY_KEYS } from "../keys";
import type { CreateCoupon, Coupon } from "@/schemas";
import { getApiUrl } from "@/lib/utils/api";

type CreateCouponResponse = {
  success: boolean;
  coupon: Coupon;
  message: string;
};

type UpdateCouponResponse = {
  success: boolean;
  coupon: Coupon;
  message: string;
};

type DeleteCouponResponse = {
  success: boolean;
  message: string;
};

type ToggleCouponResponse = {
  success: boolean;
  coupon: Coupon;
  message: string;
};

export const useCouponMutation = () => {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: async (data: CreateCoupon) => {
      const response = await fetch(`${getApiUrl()}/admin/coupons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || "Error creating coupon";
        throw new Error(errorMessage);
      }

      return (await response.json()) as CreateCouponResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: COUPON_QUERY_KEYS.list() });
      queryClient.invalidateQueries({ queryKey: COUPON_QUERY_KEYS.activeCoupons() });
      toast.success(data.message || "Coupon created successfully");
    },
    onError: (error: Error) => {
      console.error("Error creating coupon:", error);
      toast.error(error.message || "Error creating coupon");
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateCoupon> }) => {
      const response = await fetch(`${getApiUrl()}/admin/coupon/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || "Error updating coupon";
        throw new Error(errorMessage);
      }

      return (await response.json()) as UpdateCouponResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: COUPON_QUERY_KEYS.list() });
      queryClient.invalidateQueries({ queryKey: COUPON_QUERY_KEYS.activeCoupons() });
      toast.success(data.message || "Coupon updated successfully");
    },
    onError: (error: Error) => {
      console.error("Error updating coupon:", error);
      toast.error(error.message || "Error updating coupon");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${getApiUrl()}/admin/coupon/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || "Error deleting coupon";
        throw new Error(errorMessage);
      }

      return (await response.json()) as DeleteCouponResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: COUPON_QUERY_KEYS.list() });
      queryClient.invalidateQueries({ queryKey: COUPON_QUERY_KEYS.activeCoupons() });
      toast.success(data.message || "Coupon deleted successfully");
    },
    onError: (error: Error) => {
      console.error("Error deleting coupon:", error);
      toast.error(error.message || "Error deleting coupon");
    },
  });

  const toggle = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${getApiUrl()}/admin/coupon/${id}/toggle`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || "Error toggling coupon status";
        throw new Error(errorMessage);
      }

      return (await response.json()) as ToggleCouponResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: COUPON_QUERY_KEYS.list() });
      queryClient.invalidateQueries({ queryKey: COUPON_QUERY_KEYS.activeCoupons() });
      toast.success(data.message || "Coupon status updated successfully");
    },
    onError: (error: Error) => {
      console.error("Error toggling coupon status:", error);
      toast.error(error.message || "Error toggling coupon status");
    },
  });

  return {
    create: create.mutate,
    update: update.mutate,
    remove: remove.mutate,
    toggle: toggle.mutate,
    createAsync: create.mutateAsync,
    updateAsync: update.mutateAsync,
    removeAsync: remove.mutateAsync,
    toggleAsync: toggle.mutateAsync,
    isCreating: create.isPending,
    isUpdating: update.isPending,
    isDeleting: remove.isPending,
    isToggling: toggle.isPending,
    createError: create.error,
    updateError: update.error,
    deleteError: remove.error,
    toggleError: toggle.error,
  };
};
