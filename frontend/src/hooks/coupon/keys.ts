export const COUPON_QUERY_KEYS = {
  all: ["coupons"] as const,
  lists: () => [...COUPON_QUERY_KEYS.all, "list"] as const,
  list: () => [...COUPON_QUERY_KEYS.lists()] as const,
  activeCoupons: () => [...COUPON_QUERY_KEYS.all, "active"] as const,
  details: () => [...COUPON_QUERY_KEYS.all, "detail"] as const,
  detail: (id: string) => [...COUPON_QUERY_KEYS.details(), id] as const,
};
