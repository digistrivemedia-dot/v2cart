"use client";

import { toast } from "sonner";
import { IoClose } from "react-icons/io5";
import type { CartItem } from "@/schemas";
import { useCartMutation } from "@/hooks/cart";

export const DeleteButton = ({ cartItemId }: { cartItemId: CartItem["id"] }) => {
  const { remove: removeFromCart } = useCartMutation();

  const handleDelete = async () => {
    try {
      removeFromCart({ itemId: cartItemId });
    } catch (error) {
      console.error("Error removing item from cart", error);
      toast.error("Error removing item from cart");
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={false}
      aria-label="Delete item"
      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
    >
      <IoClose className="w-5 h-5" />
    </button>
  );
};
