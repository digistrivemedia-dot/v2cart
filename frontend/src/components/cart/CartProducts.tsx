"use client";

/** FUNCTIONALITY */
import { useState } from "react";
import { useCart } from "@/hooks/cart";
import { useValidateCoupon } from "@/hooks/coupon";
import { useTaxSettings } from "@/hooks/useTaxSettings";
import { toast } from "sonner";
/** COMPONENTS */
import Link from "next/link";
import { ButtonCheckout } from "./ButtonCheckout";
import { CartProduct } from "./CartProduct";
/** TYPES */
import type { ProductWithVariants } from "@/schemas";
import { HiShoppingCart, HiArrowRight, HiTag, HiX } from "react-icons/hi";

/**
 * Returns the correct price for a given size by searching through product variants.
 * Falls back to the base product price if no size-specific variant is found.
 */
const getPriceForSize = (product: any, size: string): number => {
  if (!product) return 0;
  if (product.variants && product.variants.length > 0) {
    for (const variant of product.variants) {
      const variantSizes: string[] =
        variant.sizes && variant.sizes.length > 0
          ? variant.sizes
          : variant.size
            ? [variant.size]
            : [];
      if (variantSizes.includes(size)) {
        return variant.price ?? product.price ?? 0;
      }
    }
  }
  return product.price ?? 0;
};


export const CartProducts = ({
  allProducts,
}: {
  allProducts: ProductWithVariants[];
}) => {
  const { items } = useCart();
  const { validateAsync, isValidating } = useValidateCoupon();
  // The rate admin set, not a hardcoded 18% — see hooks/useTaxSettings.
  const { gstPct, gstRate } = useTaxSettings();

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount: number;
    discountType: "percentage" | "fixed";
    discountValue: number;
  } | null>(null);

  if (items && items.length > 0) {
    const cartProductsWithInfo = items
      .map((cartItem) => {
        // Find product by productId instead of variantId
        const product = allProducts.find((p) => p.id === cartItem.productId);
        if (!product) return null;

        // Use the first variant or create a default one
        const variant = product.variants?.[0] || {
          id: product.id,
          color: product.color || "Default",
          size: cartItem.size,
          sizes: [cartItem.size],
          images: product.images || [],
        };

        return {
          cartItem,
          product,
          variant,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const subtotal = cartProductsWithInfo.reduce(
      (sum, { product, cartItem }) =>
        sum + getPriceForSize(product, cartItem.size) * cartItem.quantity,
      0
    );

    const discount = appliedCoupon?.discount || 0;
    const subtotalAfterDiscount = subtotal - discount;
    const tax = subtotalAfterDiscount * gstRate;
    const totalPrice = subtotalAfterDiscount + tax;
    const savings = cartProductsWithInfo.reduce(
      (sum, { product, cartItem }) => {
        const sizePrice = getPriceForSize(product, cartItem.size);
        const mrp = product.cuttedPrice || sizePrice;
        return sum + (mrp - sizePrice) * cartItem.quantity;
      },
      0
    );

    const handleApplyCoupon = async () => {
      if (!couponCode.trim()) {
        toast.error("Please enter a coupon code");
        return;
      }

      try {
        const result = await validateAsync({
          code: couponCode.toUpperCase(),
          orderAmount: subtotal,
        });

        if (result.valid && result.coupon) {
          setAppliedCoupon({
            code: result.coupon.code,
            discount: result.coupon.discount,
            discountType: result.coupon.discountType,
            discountValue: result.coupon.discountValue,
          });
          toast.success(`Coupon "${result.coupon.code}" applied successfully!`);
        }
      } catch (error: any) {
        toast.error(error.message || "Invalid coupon code");
      }
    };

    const handleRemoveCoupon = () => {
      setAppliedCoupon(null);
      setCouponCode("");
      toast.success("Coupon removed");
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 py-8 px-4 sm:px-6 lg:px-8 overflow-x-hidden">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
              Shopping Cart
            </h1>
            <p className="text-slate-600">
              {items.length} {items.length === 1 ? 'item' : 'items'} in your cart
            </p>
          </div>

          <div className="flex flex-col lg:grid lg:grid-cols-3 gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {cartProductsWithInfo.map(({ product, cartItem, variant }) => (
                <CartProduct
                  key={cartItem.id}
                  product={product}
                  cartItemId={cartItem.id}
                  size={cartItem.size}
                  quantity={cartItem.quantity}
                  variant={variant}
                />
              ))}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 sticky top-4">
                <h2 className="text-xl font-bold text-slate-900 mb-6 pb-4 border-b border-slate-200">
                  Order Summary
                </h2>

                {/* COUPON SECTION - COMMENTED OUT (Not working - Use checkout page coupon instead)
                   TODO: Uncomment the code below if you want to use cart page coupon in the future
                
                <div className="mb-6 pb-6 border-b border-slate-200">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Have a coupon code?
                  </label>
                  {!appliedCoupon ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        placeholder="Enter coupon code"
                        className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent uppercase"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleApplyCoupon();
                          }
                        }}
                      />
                      <button
                        onClick={handleApplyCoupon}
                        disabled={isValidating || !couponCode.trim()}
                        className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isValidating ? "..." : "Apply"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <HiTag className="w-5 h-5 text-green-600" />
                        <div>
                          <div className="font-semibold text-green-900">{appliedCoupon.code}</div>
                          <div className="text-sm text-green-700">
                            {appliedCoupon.discountType === 'percentage'
                              ? `${appliedCoupon.discountValue}% off`
                              : `₹${appliedCoupon.discountValue} off`}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={handleRemoveCoupon}
                        className="p-1 hover:bg-green-100 rounded-lg transition-colors"
                        title="Remove coupon"
                      >
                        <HiX className="w-5 h-5 text-green-700" />
                      </button>
                    </div>
                  )}
                </div>
                */}

                {/* Price Breakdown */}
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal ({items.length} items)</span>
                    <span className="font-medium">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>

                  {savings > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span className="flex items-center gap-1">
                        <HiTag className="w-4 h-4" />
                        Savings
                      </span>
                      <span className="font-medium">-₹{savings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  {appliedCoupon && discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span className="flex items-center gap-1">
                        <HiTag className="w-4 h-4" />
                        Coupon Discount
                      </span>
                      <span className="font-medium">-₹{discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-slate-600">
                    <span>Tax (GST {gstPct}%)</span>
                    <span className="font-medium">₹{tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Shipping</span>
                    <span className="font-medium text-green-600">FREE</span>
                  </div>
                </div>

                {/* Total */}
                <div className="pt-4 border-t border-slate-200 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-slate-900">Total</span>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-orange-600">
                        ₹{totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-slate-500">Incl. all taxes</div>
                    </div>
                  </div>
                </div>

                {/* Checkout Button */}
                <ButtonCheckout cartItems={items} />

                {/* Continue Shopping */}
                <Link
                  href="/"
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3 px-6 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium"
                >
                  Continue Shopping
                </Link>

                {/* Benefits */}
                <div className="mt-6 pt-6 border-t border-slate-200 space-y-3">
                  <div className="flex items-start gap-3 text-sm text-slate-600">
                    <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Free shipping on all orders</span>
                  </div>
                  <div className="flex items-start gap-3 text-sm text-slate-600">
                    <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Secure payment processing</span>
                  </div>
                  <div className="flex items-start gap-3 text-sm text-slate-600">
                    <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Easy returns within 30 days</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[calc(100vh-200px)] gap-6 px-4 py-20">
      <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <HiShoppingCart className="w-12 h-12 text-slate-400" />
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 text-center">
        Your Cart is Empty
      </h1>
      <p className="text-lg text-slate-600 text-center max-w-md">
        Looks like you haven't added anything to your cart yet. Start shopping to find something you'll love!
      </p>
      <Link
        href="/"
        className="mt-4 flex items-center gap-2 px-8 py-4 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
      >
        <span>Start Shopping</span>
        <HiArrowRight className="w-5 h-5" />
      </Link>
    </div>
  );
};
