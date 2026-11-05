import { useQuery } from "@tanstack/react-query";
import { CATEGORY_QUERY_KEYS } from "../keys";
import type { Category } from "@/schemas";
import { getApiUrl } from "@/lib/utils/api";

type CategoriesResponse = {
  success: boolean;
  count: number;
  categories: Category[];
};

export const useCategories = (includeInactive = false) => {
  const query = useQuery({
    queryKey: includeInactive
      ? CATEGORY_QUERY_KEYS.adminList()
      : CATEGORY_QUERY_KEYS.activeCategories(),
    queryFn: async () => {
      const url = includeInactive
        ? `${getApiUrl()}/admin/categories?includeInactive=true`
        : `${getApiUrl()}/categories`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add auth token if fetching admin categories
      if (includeInactive) {
        const token = localStorage.getItem("auth_token");
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      }

      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error("Error loading categories");
      }

      const data = await response.json();

      return {
        success: data.success,
        count: data.count,
        categories: data.categories || [],
      } as CategoriesResponse;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    ...query,
    categories: query.data?.categories ?? [],
    count: query.data?.count ?? 0,
  };
};
