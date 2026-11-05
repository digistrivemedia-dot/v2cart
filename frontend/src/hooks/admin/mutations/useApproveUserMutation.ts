import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiUrl } from "@/lib/utils/api";
import { ADMIN_QUERY_KEYS } from "../keys";

export const useApproveUserMutation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ userId, approvalStatus }: { userId: string; approvalStatus: "approved" | "rejected" }) => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${getApiUrl()}/admin/user/${userId}/approve`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ approvalStatus }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update approval status");
      }

      return data.user;
    },
    onSuccess: (_data, variables) => {
      toast.success(`Account ${variables.approvalStatus}`);
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.users() });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update approval status"),
  });

  return {
    approve: mutation.mutate,
    isPending: mutation.isPending,
  };
};
