export const WALLET_QUERY_KEYS = {
  all: ["wallet"] as const,
  balance: () => [...WALLET_QUERY_KEYS.all, "balance"] as const,
  statement: (bucket?: string) => [...WALLET_QUERY_KEYS.all, "statement", bucket ?? "all"] as const,
};
