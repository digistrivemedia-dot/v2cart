"use client";

import { useWishlist } from "@/hooks/wishlist";
import { useWishlistMutation } from "@/hooks/wishlist/mutations/useWishlistMutation";
import { useThrottleFn } from "ahooks";
import { toast } from "sonner";
import { FiHeart } from "react-icons/fi";
import { FaHeart } from "react-icons/fa";

interface WishlistButtonProps {
    productId: string;
}

export const WishlistButton = ({ productId }: WishlistButtonProps) => {
    const { isInWishlist, isLoading } = useWishlist();
    const { remove: removeFromWishlist, add: addToWishlist } = useWishlistMutation();

    const isFavorite = isInWishlist(productId as any);

    const { run: throttledToggle } = useThrottleFn(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (isFavorite) {
                removeFromWishlist({ productId: productId as any });
                toast.success("Removed from wishlist");
            } else {
                addToWishlist(productId as any);
                toast.success("Added to wishlist");
            }
        },
        { wait: 300 }
    );

    if (isLoading) {
        return (
            <div className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                <div className="w-4 h-4 rounded-full bg-gray-200 animate-pulse" />
            </div>
        );
    }

    return (
        <button
            onClick={throttledToggle}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg hover:scale-110 ${isFavorite
                    ? "bg-red-500 text-white"
                    : "bg-white/90 backdrop-blur-sm text-slate-700 hover:bg-white"
                }`}
            title={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
        >
            {isFavorite ? (
                <FaHeart className="w-5 h-5" />
            ) : (
                <FiHeart className="w-5 h-5" />
            )}
        </button>
    );
};
