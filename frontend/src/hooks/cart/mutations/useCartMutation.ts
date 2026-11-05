import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CartItem } from "@/schemas";
import { useSession } from "@/lib/auth/client";
import { toast } from "sonner";
import { CART_QUERY_KEYS } from "../keys";

type CartResponse = { items: CartItem[] };

/**
 * Cart mutations.
 *
 * The cart lives in the database (on the user document) and every endpoint
 * answers with the whole cart, so each mutation simply writes the response
 * into the cache — there is nothing to reconcile, and no locally-minted ids
 * to reconcile it against. Quantity and removal still apply optimistically
 * first, because a stepper that waits on a round trip feels broken.
 */
export const useCartMutation = () => {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const key = CART_QUERY_KEYS.cartList(session?.user?.id || "guest");

  const request = async (
    url: string,
    init: { method: string; body?: unknown }
  ): Promise<CartItem[]> => {
    const response = await fetch(url, {
      method: init.method,
      headers: { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "Cart request failed");
    return (data.items ?? []) as CartItem[];
  };

  const commit = (items: CartItem[]) =>
    queryClient.setQueryData<CartResponse>(key, { items });

  /** Roll the cache back to the server's version after a failed mutation. */
  const resync = () => queryClient.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: (params: {
      productId: string;
      size?: string;
      color?: string;
      quantity?: number;
      // Accepted and ignored — older callers still pass these.
      variantId?: unknown;
      stripeId?: unknown;
    }) =>
      request("/api/user/cart", {
        method: "POST",
        body: {
          productId: params.productId,
          size: params.size,
          color: params.color,
          quantity: params.quantity ?? 1,
        },
      }),
    onSuccess: commit,
    onError: (error) => {
      resync();
      toast.error(error?.message || "Could not add item to cart. Please try again.");
    },
  });

  const update = useMutation({
    mutationFn: (params: { itemId: string; quantity: number }) =>
      request("/api/user/cart", {
        method: "PATCH",
        body: { itemId: params.itemId, quantity: params.quantity },
      }),
    onMutate: async ({ itemId, quantity }) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<CartResponse>(key, (current = { items: [] }) => ({
        items: current.items.map((i: any) =>
          i.id === itemId ? { ...i, quantity } : i
        ),
      }));
    },
    onSuccess: commit,
    onError: (error) => {
      resync();
      toast.error(error?.message || "Could not update cart quantity. Please try again.");
    },
  });

  const remove = useMutation({
    mutationFn: ({ itemId }: { itemId: string }) =>
      request(`/api/user/cart?id=${encodeURIComponent(itemId)}`, { method: "DELETE" }),
    onMutate: async ({ itemId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<CartResponse>(key, (current = { items: [] }) => ({
        items: current.items.filter((i: any) => i.id !== itemId),
      }));
    },
    onSuccess: (items) => {
      commit(items);
      toast.success("Removed from cart");
    },
    onError: (error) => {
      resync();
      toast.error(error?.message || "Could not remove item from cart. Please try again.");
    },
  });

  const clear = useMutation({
    mutationFn: () => request("/api/user/cart", { method: "DELETE" }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<CartResponse>(key, { items: [] });
    },
    onSuccess: commit,
    onError: (error) => {
      resync();
      toast.error(error?.message || "Could not clear cart. Please try again.");
    },
  });

  return {
    add: add.mutate,
    update: update.mutate,
    remove: remove.mutate,
    clear: clear.mutate,
    isAdding: add.isPending,
    isUpdating: update.isPending,
    isRemoving: remove.isPending,
    isClearing: clear.isPending,
    addError: add.error,
    updateError: update.error,
    removeError: remove.error,
    clearError: clear.error,
  };
};
