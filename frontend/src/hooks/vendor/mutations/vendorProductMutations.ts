import { getApiUrl } from "@/lib/utils/api";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function createVendorProduct(payload: Record<string, unknown>) {
  const response = await fetch(`${getApiUrl()}/vendor/product/new`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to create product");
  }

  return result.product;
}

export async function updateVendorProduct({ id, payload }: { id: string; payload: Record<string, unknown> }) {
  const response = await fetch(`${getApiUrl()}/vendor/product/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to update product");
  }

  return result.product;
}

export async function deleteVendorProduct(id: string) {
  const response = await fetch(`${getApiUrl()}/vendor/product/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
    credentials: "include",
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Failed to delete product");
  }

  return true;
}
