import { useQuery } from "@tanstack/react-query";
import { ADMIN_QUERY_KEYS } from "../keys";
import { getApiUrl } from "@/lib/utils/api";

export type PaymentRole = "customer" | "vendor" | "investor";

export interface Payment {
  id: string;
  role: PaymentRole;
  type: string;
  label: string;
  userName: string;
  userEmail: string;
  amount: number;
  reference: string;
  status: string | null;
  date: string;
}

export const useAllPayments = () => {
  const query = useQuery({
    queryKey: ADMIN_QUERY_KEYS.payments(),
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${getApiUrl()}/admin/payments`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load payments");
      }

      return data as { count: number; payments: Payment[] };
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60 * 1000,
  });

  return {
    ...query,
    payments: query.data?.payments ?? [],
  };
};
