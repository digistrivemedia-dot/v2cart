"use client";

import { useCartMutation } from "@/hooks/cart";
import { FiShoppingCart } from "react-icons/fi";
import { toast } from "sonner";

interface AddToCartButtonProps {
    productId: string;
    variantId?: number;
    stripeId?: string;
    size: string;
}

export const AddToCartButton = ({ productId, size }: AddToCartButtonProps) => {
    const { add, isAdding } = useCartMutation();

    const handleAddToCart = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Product ids are Mongo ObjectIds. This used to parseInt them, which
        // produced NaN and a cart line that matched no product.
        add({ productId, size, quantity: 1 });
        toast.success("Added to cart!");
    };

    return (
        <button
            onClick={handleAddToCart}
            disabled={isAdding}
            className="px-6 py-3 bg-yellow-500 text-white font-semibold rounded-lg hover:bg-yellow-600 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center gap-2 disabled:opacity-50"
        >
            <FiShoppingCart className="w-5 h-5" />
            {isAdding ? 'Adding...' : 'Add to Cart'}
        </button>
    );
};
