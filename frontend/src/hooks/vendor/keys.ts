export const VENDOR_QUERY_KEYS = {
  all: ["vendor"] as const,
  stats: () => [...VENDOR_QUERY_KEYS.all, "stats"] as const,
  products: () => [...VENDOR_QUERY_KEYS.all, "products"] as const,
  orders: () => [...VENDOR_QUERY_KEYS.all, "orders"] as const,
  transactions: () => [...VENDOR_QUERY_KEYS.all, "transactions"] as const,
};
