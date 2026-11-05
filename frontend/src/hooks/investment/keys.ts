export const INVESTMENT_QUERY_KEYS = {
  all: ["investments"] as const,
  mine: () => [...INVESTMENT_QUERY_KEYS.all, "mine"] as const,
  earnings: () => [...INVESTMENT_QUERY_KEYS.all, "earnings"] as const,
  investableProducts: () => [...INVESTMENT_QUERY_KEYS.all, "investable-products"] as const,
};
