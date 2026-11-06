import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/utils/api";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
};

export const useWithdrawMutation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (amount: number) => {
      const response = await fetch(`${getApiUrl()}/wallet/withdraw`, {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({ amount }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Withdrawal failed");
      }
      return data as { message: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
    },
  });

  return {
    ...mutation,
    withdrawAsync: mutation.mutateAsync,
  };
};
