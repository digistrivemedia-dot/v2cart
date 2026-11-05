export const ORDER_QUERY_KEYS = {
  all: ["orders"] as const,
  adminList: () => [...ORDER_QUERY_KEYS.all, "admin-list"] as const,
};
