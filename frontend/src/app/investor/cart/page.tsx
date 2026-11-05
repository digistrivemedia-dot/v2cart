"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef } from "react";
import { HiShoppingCart, HiTrash, HiArrowLeft, HiCash } from "react-icons/hi";
import { useInvestorCartStore } from "@/stores/investorCartStore";
import { useInvestMutation } from "@/hooks/investment";
import { useWallet } from "@/hooks/wallet";

const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvestorCartPage() {
  const items = useInvestorCartStore((s) => s.items);
  const setQuantity = useInvestorCartStore((s) => s.setQuantity);
  const removeItem = useInvestorCartStore((s) => s.removeItem);
  const clear = useInvestorCartStore((s) => s.clear);
  const { invest, isPending } = useInvestMutation();
  const { wallet, isLoading: walletLoading } = useWallet();
  // Belt-and-suspenders alongside `disabled={isPending}` below — a fast
  // double-click can fire twice before React re-renders the disabled state.
  // The server's conditional debit makes a double-spend impossible anyway,
  // but this avoids the second request entirely.
  const investInFlightRef = useRef(false);

  const total = items.reduce((sum, i) => sum + i.investorPrice * i.quantity, 0);

  // Funded from `capital`, not from the whole withdrawable balance: earnings
  // are profit and stay withdrawable rather than being silently redeployed.
  const shortfall = Number((total - wallet.capital).toFixed(2));
  const canAfford = shortfall <= 0;

  const handleInvestNow = () => {
    if (investInFlightRef.current) return;
    investInFlightRef.current = true;
    invest(
      {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      },
      {
        onSuccess: () => clear(),
        onSettled: () => { investInFlightRef.current = false; },
      }
    );
  };

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-slate-200 text-center py-20">
        <HiShoppingCart className="w-20 h-20 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-900 mb-2">Your invest cart is empty</h3>
        <p className="text-slate-600 mb-6">Add products from the invest page to fund multiple units from your wallet.</p>
        <Link
          href="/investor/products"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
        >
          <HiArrowLeft className="w-4 h-4" />
          Browse products to invest in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Invest Cart</h1>
        <p className="text-slate-600 mt-1">
          Review your selections, then fund every unit below from your wallet.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-200 divide-y divide-slate-200">
        {items.map((item) => (
          <div key={item.productId} className="flex items-center gap-4 p-4">
            <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-slate-100">
              {item.img && (
                <Image src={item.img} alt={item.name} fill className="object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 truncate">{item.name}</p>
              <p className="text-sm text-slate-500">₹{item.investorPrice} / unit</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity(item.productId, item.quantity - 1)}
                className="w-7 h-7 flex items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(item.productId, item.quantity + 1)}
                disabled={item.quantity >= item.maxQuantity}
                className="w-7 h-7 flex items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
            <p className="w-24 text-right font-semibold text-slate-900">₹{item.investorPrice * item.quantity}</p>
            <button
              type="button"
              onClick={() => removeItem(item.productId)}
              className="text-slate-400 hover:text-red-500 transition-colors"
              aria-label={`Remove ${item.name}`}
            >
              <HiTrash className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Total investment</p>
            <p className="text-2xl font-bold text-slate-900">{rupees(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Wallet capital</p>
            <p
              className={`text-2xl font-bold ${canAfford ? "text-emerald-700" : "text-red-600"}`}
            >
              {walletLoading ? "…" : rupees(wallet.capital)}
            </p>
          </div>
        </div>

        {/* Short of capital: say exactly how much and link straight to the
            top-up, rather than letting them press a button that fails. */}
        {!walletLoading && !canAfford && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <HiCash className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <p className="flex-1 text-sm text-amber-900">
              You need <strong>{rupees(shortfall)}</strong> more capital to fund this cart.
              {wallet.earnings > 0 && (
                <span className="text-amber-700">
                  {" "}
                  You have {rupees(wallet.earnings)} in earnings — withdraw it or top up to invest
                  it.
                </span>
              )}
            </p>
            <Link
              href={`/investor/wallet?add=${Math.ceil(shortfall)}`}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
            >
              Add {rupees(Math.ceil(shortfall))}
            </Link>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <Link href="/investor/wallet" className="text-sm font-medium text-emerald-700 hover:underline">
            Manage wallet
          </Link>
          <button
            type="button"
            onClick={handleInvestNow}
            disabled={isPending || !canAfford || walletLoading}
            title={!canAfford ? "Top up your wallet to fund this cart" : undefined}
            className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Placing…" : canAfford ? `Invest ${rupees(total)} from wallet` : "Insufficient wallet balance"}
          </button>
        </div>
      </div>
    </div>
  );
}
