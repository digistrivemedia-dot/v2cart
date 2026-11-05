/**
 * Get the API base URL from environment variable
 * Removes trailing slashes to prevent double slashes in URLs
 */
export const getApiUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';
  return url.replace(/\/+$/, ''); // Remove trailing slashes
};
