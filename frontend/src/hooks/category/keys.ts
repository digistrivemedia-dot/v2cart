export const CATEGORY_QUERY_KEYS = {
  all: ["categories"] as const,
  lists: () => [...CATEGORY_QUERY_KEYS.all, "list"] as const,
  list: () => [...CATEGORY_QUERY_KEYS.lists()] as const,
  adminList: () => [...CATEGORY_QUERY_KEYS.all, "admin-list"] as const,
  activeCategories: () => [...CATEGORY_QUERY_KEYS.all, "active"] as const,
  details: () => [...CATEGORY_QUERY_KEYS.all, "detail"] as const,
  detail: (id: string) => [...CATEGORY_QUERY_KEYS.details(), id] as const,
};
