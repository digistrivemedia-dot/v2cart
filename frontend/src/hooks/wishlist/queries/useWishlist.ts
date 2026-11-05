import { useQuery } from "@tanstack/react-query";
import { WISHLIST_QUERY_KEYS } from "../keys";
import { WishlistItemSchema, type WishlistItem } from "@/schemas";
import { useSession } from "@/lib/auth/client";

type WishlistResponse = { items: WishlistItem[] };

export const useWishlist = () => {
  const { data: session } = useSession();

  // Get user ID - handle both 'id' and '_id' fields
  const userId = session?.user?.id || (session?.user as any)?._id || session?.user?.email;

  const query = useQuery({
    enabled: !!session?.user && !!userId,
    queryKey: WISHLIST_QUERY_KEYS.wishlistList(userId!),
    queryFn: async () => {
      const response = await fetch("/api/user/wishlist", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Error al cargar el wishlist");
      }

      const data = await response.json();
      return {
        items: WishlistItemSchema.array().parse(data.items),
      } as WishlistResponse;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const items = query.data?.items ?? [];
  const ids = new Set(items.map((i) => i.productId));
  const isInWishlist = (productId: number) => ids.has(productId);

  return {
    ...query,
    items,
    count: items.length,
    isInWishlist,
  };
};
