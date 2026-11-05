import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CATEGORY_QUERY_KEYS } from "../keys";
import type { CreateCategory, Category } from "@/schemas";
import { getApiUrl } from "@/lib/utils/api";

type CategoryResponse = {
  success: boolean;
  category: Category;
  message: string;
};

export const useCategoryMutation = () => {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: async (data: CreateCategory) => {
      const response = await fetch(`${getApiUrl()}/admin/categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || "Error creating category";
        throw new Error(errorMessage);
      }

      return (await response.json()) as CategoryResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CATEGORY_QUERY_KEYS.all });
      toast.success(data.message || "Category created successfully");
    },
    onError: (error: Error) => {
      console.error("Error creating category:", error);
      toast.error(error.message || "Error creating category");
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateCategory> }) => {
      const response = await fetch(`${getApiUrl()}/admin/category/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || "Error updating category";
        throw new Error(errorMessage);
      }

      return (await response.json()) as CategoryResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CATEGORY_QUERY_KEYS.all });
      toast.success(data.message || "Category updated successfully");
    },
    onError: (error: Error) => {
      console.error("Error updating category:", error);
      toast.error(error.message || "Error updating category");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${getApiUrl()}/admin/category/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || "Error deleting category";
        throw new Error(errorMessage);
      }

      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CATEGORY_QUERY_KEYS.all });
      toast.success(data.message || "Category deleted successfully");
    },
    onError: (error: Error) => {
      console.error("Error deleting category:", error);
      toast.error(error.message || "Error deleting category");
    },
  });

  const toggle = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${getApiUrl()}/admin/category/${id}/toggle`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || "Error toggling category status";
        throw new Error(errorMessage);
      }

      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CATEGORY_QUERY_KEYS.all });
      toast.success(data.message || "Category status updated successfully");
    },
    onError: (error: Error) => {
      console.error("Error toggling category status:", error);
      toast.error(error.message || "Error toggling category status");
    },
  });

  const reorder = useMutation({
    mutationFn: async (categories: { id: string; order: number }[]) => {
      const response = await fetch(`${getApiUrl()}/admin/categories/reorder`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ categories }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || "Error reordering categories";
        throw new Error(errorMessage);
      }

      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CATEGORY_QUERY_KEYS.all });
      toast.success(data.message || "Categories reordered successfully");
    },
    onError: (error: Error) => {
      console.error("Error reordering categories:", error);
      toast.error(error.message || "Error reordering categories");
    },
  });

  return {
    create: create.mutate,
    update: update.mutate,
    remove: remove.mutate,
    toggle: toggle.mutate,
    reorder: reorder.mutate,
    createAsync: create.mutateAsync,
    updateAsync: update.mutateAsync,
    removeAsync: remove.mutateAsync,
    toggleAsync: toggle.mutateAsync,
    reorderAsync: reorder.mutateAsync,
    isCreating: create.isPending,
    isUpdating: update.isPending,
    isDeleting: remove.isPending,
    isToggling: toggle.isPending,
    isReordering: reorder.isPending,
    createError: create.error,
    updateError: update.error,
    deleteError: remove.error,
    toggleError: toggle.error,
    reorderError: reorder.error,
  };
};
