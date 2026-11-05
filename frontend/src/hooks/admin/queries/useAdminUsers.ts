import { useQuery } from "@tanstack/react-query";
import { ADMIN_QUERY_KEYS } from "../keys";
import { getApiUrl } from "@/lib/utils/api";

export const useAdminUsers = () => {
  const query = useQuery({
    queryKey: ADMIN_QUERY_KEYS.users(),
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`${getApiUrl()}/admin/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load users");
      }

      return data.users as any[];
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60 * 1000,
  });

  return {
    ...query,
    users: query.data ?? [],
  };
};
