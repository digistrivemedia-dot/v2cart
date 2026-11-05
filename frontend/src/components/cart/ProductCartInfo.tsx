"use client";

/** FUNCTIONALITY */
import { useThrottleFn } from "ahooks";
import { useCartMutation } from "@/hooks/cart";
/** ICONS */
import { IoAdd, IoRemove } from "react-icons/io5";
/** TYPES */
import type { ProductVariant, CartItem } from "@/schemas";

interface ProductCartInfoProps {
  cartItemId: CartItem["id"];
  size: CartItem["size"];
  quantity: CartItem["quantity"];
  color: ProductVariant["color"];
}

export const ProductCartInfo = ({
  cartItemId,
  size,
  quantity,
  color,
}: ProductCartInfoProps) => {
  const { update: editQuantity, remove: removeFromCart } = useCartMutation();

  const { run: throttledIncrease } = useThrottleFn(
    () => {
      editQuantity({
        itemId: cartItemId,
        quantity: quantity + 1,
      });
    },
    {
      wait: 300,
    }
  );

  const { run: throttledDecrease } = useThrottleFn(
    () => {
      if (quantity > 1) {
        editQuantity({
          itemId: cartItemId,
          quantity: quantity - 1,
        });
      } else {
        removeFromCart({ itemId: cartItemId });
      }
    },
    {
      wait: 300,
    }
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Variant Info */}
      <div className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Size:</span>
          <span className="font-medium text-slate-900">{size}</span>
        </div>
        <div className="w-px h-4 bg-slate-200"></div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Color:</span>
          <span className="font-medium text-slate-900">{color}</span>
        </div>
      </div>

      {/* Quantity Selector */}
      <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm">
        <button
          className="flex items-center justify-center w-8 h-8 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-l-lg transition-colors disabled:opacity-50"
          onClick={throttledDecrease}
          disabled={false}
          aria-label="Decrease quantity"
        >
          <IoRemove className="w-4 h-4" />
        </button>
        <span
          className="flex items-center justify-center w-10 h-8 text-sm font-medium text-slate-900 border-x border-slate-100 bg-slate-50"
          aria-label={`Current quantity: ${quantity}`}
        >
          {quantity}
        </span>
        <button
          className="flex items-center justify-center w-8 h-8 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-r-lg transition-colors disabled:opacity-50"
          onClick={throttledIncrease}
          disabled={false}
          aria-label="Increase quantity"
        >
          <IoAdd className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
