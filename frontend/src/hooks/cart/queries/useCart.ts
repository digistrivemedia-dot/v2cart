import { useQuery } from "@tanstack/react-query";
import { CART_QUERY_KEYS } from "../keys";
import type { CartItem } from "@/schemas";
import { useSession } from "@/lib/auth/client";

type CartResponse = { items: CartItem[] };

export const useCart = () => {
  const { data: session } = useSession();

  // Use session user ID if logged in, otherwise use "guest" as fallback
  const userId = session?.user?.id || "guest";

  const query = useQuery({
    queryKey: CART_QUERY_KEYS.cartList(userId),
    queryFn: async () => {
      const response = await fetch("/api/user/cart", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch cart");
      }

      const data = await response.json();
      return { items: (data.items ?? []) as CartItem[] } as CartResponse;
    },
    // The same cart is editable from the mobile app, so a cached copy goes
    // stale without anything here knowing. Re-reading on mount and on window
    // focus is what makes "added on the phone" show up in the browser.
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const items = query.data?.items ?? [];

  const getCartItemById = (id: CartItem["id"]): CartItem | undefined => {
    return items.find((item: any) => item.id === id);
  };

  return {
    ...query,
    items,
    getCartItemById,
  };
};
