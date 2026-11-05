export const ADMIN_QUERY_KEYS = {
  all: ["admin"] as const,
  users: () => [...ADMIN_QUERY_KEYS.all, "users"] as const,
  transactionsSummary: (from?: string, to?: string) =>
    [...ADMIN_QUERY_KEYS.all, "transactions-summary", from ?? null, to ?? null] as const,
  pricingSettings: () => [...ADMIN_QUERY_KEYS.all, "pricing-settings"] as const,
  payments: () => [...ADMIN_QUERY_KEYS.all, "payments"] as const,
};
