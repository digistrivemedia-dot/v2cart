import { useMutation, useQueryClient } from "@tanstack/react-query";
import { WishlistItemSchema, type WishlistItem } from "@/schemas";
import { useSession } from "@/lib/auth/client";
import { toast } from "sonner";
import { WISHLIST_QUERY_KEYS } from "../keys";

type WishlistResponse = { items: WishlistItem[] };

export const useWishlistMutation = () => {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  // Get user ID - handle both 'id' and '_id' fields
  const userId = session?.user?.id || (session?.user as any)?._id || session?.user?.email;

  const add = useMutation({
    mutationFn: async (productId: number) => {
      // Check authentication before making the request
      if (!session?.user || !userId) {
        toast.info("Login first to add to wishlist");
        throw new Error("Unauthorized");
      }

      const response = await fetch(
        `/api/user/wishlist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || "Error at adding to wishlist";
        throw new Error(errorMessage);
      }

      const { item } = await response.json();
      return WishlistItemSchema.parse(item);
    },
    onMutate: async (productId: number) => {
      if (!session?.user || !userId) {
        return; // Already handled in mutationFn
      }

      await queryClient.cancelQueries({
        queryKey: WISHLIST_QUERY_KEYS.wishlistList(userId),
      });

      const previousData = queryClient.getQueryData<WishlistResponse>(
        WISHLIST_QUERY_KEYS.wishlistList(userId)
      );

      const tempItem: WishlistItem = {
        id: -Math.floor(Math.random() * 1e9),
        userId: "temp",
        productId: productId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<WishlistResponse>(
        WISHLIST_QUERY_KEYS.wishlistList(userId),
        (old = { items: [] }) => {
          if (old.items.some((w) => w.productId === productId)) {
            return old;
          }
          return { items: [tempItem, ...old.items] };
        }
      );

      return { previousData, tempItem };
    },
    onSuccess: (data, _, context) => {
      const { tempItem } = context as {
        previousData?: WishlistResponse;
        tempItem: WishlistItem;
      };

      if (!userId) return;

      queryClient.setQueryData<WishlistResponse>(
        WISHLIST_QUERY_KEYS.wishlistList(userId),
        (old = { items: [] }) => ({
          items: old.items
            .filter((i) => i.id !== tempItem.id)
            .filter((i) => i.productId !== data.productId)
            .concat(data),
        })
      );
    },
    onError: (error, _, context) => {
      const { previousData } = context as {
        previousData?: WishlistResponse;
        tempItem: WishlistItem;
      };
      if (previousData && userId) {
        queryClient.setQueryData<WishlistResponse>(
          WISHLIST_QUERY_KEYS.wishlistList(userId),
          previousData
        );
      }

      console.error("Error adding to wishlist:", error);
      if (error.message === "Unauthorized") {
        toast.error("Please log in to save items to your wishlist.");
      } else {
        toast.error(error.message || "Could not add item to wishlist. Please try again.");
      }
    },
  });

  const remove = useMutation({
    mutationFn: async (params: { itemId?: number; productId?: number }) => {
      const qs = new URLSearchParams();
      if (params.itemId) qs.set("itemId", String(params.itemId));
      if (params.productId) qs.set("productId", String(params.productId));

      const response = await fetch(`/api/user/wishlist?${qs.toString()}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || "Error removing from wishlist";
        throw new Error(errorMessage);
      }

      return true;
    },
    onMutate: async (params: { itemId?: number; productId?: number }) => {
      if (!session?.user || !userId) {
        throw new Error("Unauthorized");
      }

      await queryClient.cancelQueries({
        queryKey: WISHLIST_QUERY_KEYS.wishlistList(userId),
      });

      const previousData = queryClient.getQueryData<WishlistResponse>(
        WISHLIST_QUERY_KEYS.wishlistList(userId)
      );

      queryClient.setQueryData<WishlistResponse>(
        WISHLIST_QUERY_KEYS.wishlistList(userId),
        (current = { items: [] }) => ({
          items: current.items.filter((i) =>
            params.itemId
              ? i.id !== params.itemId
              : i.productId !== params.productId
          ),
        })
      );

      return { previousData };
    },
    onError: (error, _, context) => {
      const { previousData } = context as { previousData?: WishlistResponse };

      if (previousData && userId) {
        queryClient.setQueryData<WishlistResponse>(
          WISHLIST_QUERY_KEYS.wishlistList(userId),
          previousData
        );
      }

      console.error("Error removing from wishlist:", error);
      toast.error((error as any)?.message || "Could not remove item from wishlist. Please try again.");
    },
  });

  return {
    add: add.mutate,
    remove: remove.mutate,
    addAsync: add.mutateAsync,
    removeAsync: remove.mutateAsync,
    error: add.error || remove.error,
    isAddingToWishlist: add.isPending,
    isRemovingFromWishlist: remove.isPending,
    addError: add.error,
    removeError: remove.error,
  };
};
