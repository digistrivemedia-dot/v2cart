import { useMutation } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/utils/api";
import type { UpdateProductPricing, UpdateListingStatus } from "@/schemas";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function updatePricing(productId: string, data: UpdateProductPricing) {
  const response = await fetch(`${getApiUrl()}/admin/product/${productId}/pricing`, {
    method: "PUT",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update pricing");
  }

  return result.product;
}

async function updateListingStatus(productId: string, data: UpdateListingStatus) {
  const response = await fetch(`${getApiUrl()}/admin/product/${productId}/listing-status`, {
    method: "PUT",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update listing status");
  }

  return result.product;
}

export const useProductPricingMutation = () => {
  const pricing = useMutation({
    mutationFn: ({ productId, data }: { productId: string; data: UpdateProductPricing }) =>
      updatePricing(productId, data),
  });

  const listingStatus = useMutation({
    mutationFn: ({ productId, data }: { productId: string; data: UpdateListingStatus }) =>
      updateListingStatus(productId, data),
  });

  return { pricing, listingStatus };
};
