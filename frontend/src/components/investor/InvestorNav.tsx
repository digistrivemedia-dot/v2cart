"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  HiHome,
  HiTrendingUp,
  HiClipboardList,
  HiCurrencyRupee,
  HiShoppingCart,
  HiLogout,
  HiArrowLeft,
  HiChevronDown,
  HiCash,
} from "react-icons/hi";
import { cn } from "@/lib/utils";
import { signOut, useSession } from "@/lib/auth/client";
import { useInvestorCartStore } from "@/stores/investorCartStore";
import { useWallet } from "@/hooks/wallet";

/**
 * Investor navigation — a consumer app bar, not an admin panel.
 *
 * The dark fixed sidebar this replaced read as back-office tooling. Investors
 * live in this app, so it follows the pattern consumer investing apps use:
 *
 *   • < md  — compact top bar + a fixed bottom tab bar. Five destinations is
 *             exactly the bottom-nav limit, and they sit in thumb reach.
 *   • ≥ md  — one sticky top bar carrying the same five links inline.
 *
 * Only ONE primary nav is visible at any breakpoint (never tabs AND a bar),
 * and `Logout` is deliberately kept out of the nav itself — destructive
 * actions live in the account menu, away from things people tap often.
 */

const NAV_ITEMS = [
  { title: "Home", href: "/investor", icon: HiHome },
  { title: "Invest", href: "/investor/products", icon: HiTrendingUp },
  { title: "Cart", href: "/investor/cart", icon: HiShoppingCart, showBadge: true },
  { title: "Portfolio", href: "/investor/investments", icon: HiClipboardList },
  { title: "Earnings", href: "/investor/earnings", icon: HiCurrencyRupee },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href || (href !== "/investor" && pathname.startsWith(href));
}

/**
 * The wallet balance, always on screen.
 *
 * Deliberately NOT a sixth nav destination — five is the bottom-nav limit this
 * file already documents, and a balance belongs in the chrome rather than in a
 * tab strip. Shows the withdrawable total, with capital/earnings in the title
 * for anyone who wants the split without leaving the page.
 *
 * Renders nothing while loading rather than flashing ₹0.00, which would read
 * as "your money is gone" for the moment before the fetch lands.
 */
function WalletChip() {
  const { wallet, isLoading, isError } = useWallet();

  if (isLoading || isError) return null;

  return (
    <Link
      href="/investor/wallet"
      aria-label={`Wallet: ${rupeesShort(wallet.withdrawable)} withdrawable`}
      title={`Capital ₹${wallet.capital.toFixed(2)} · Earnings ₹${wallet.earnings.toFixed(2)}`}
      className="flex h-11 cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <HiCash className="h-4 w-4 flex-shrink-0 text-emerald-600" />
      <span className="text-sm font-semibold tabular-nums text-slate-900">
        {rupeesShort(wallet.withdrawable)}
      </span>
      {wallet.earnings > 0 && (
        <span className="hidden text-xs font-medium text-emerald-700 lg:inline">
          +{rupeesShort(wallet.earnings)}
        </span>
      )}
    </Link>
  );
}

/** Compact enough for the chrome: no paise unless the amount is small. */
function rupeesShort(n: number): string {
  if (n >= 1000) return `₹${Math.round(n).toLocaleString("en-IN")}`;
  return `₹${n.toFixed(2)}`;
}

function CartBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} item${count === 1 ? "" : "s"} in invest cart`}
      className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white ring-2 ring-white"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Account menu — holds the two non-destination actions                */
/* ------------------------------------------------------------------ */

function AccountMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const user = session?.user as { name?: string; email?: string } | undefined;
  const name = user?.name || "Investor";
  const initial = name.charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-11 cursor-pointer items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors duration-200 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
          {initial}
        </span>
        <span className="hidden max-w-28 truncate text-sm font-medium text-slate-700 lg:block">
          {name}
        </span>
        <HiChevronDown
          className={cn(
            "hidden h-4 w-4 text-slate-400 transition-transform duration-200 lg:block",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            {user?.email && (
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            )}
          </div>

          <Link
            href="/"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex cursor-pointer items-center gap-2.5 px-4 py-3 text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50"
          >
            <HiArrowLeft className="h-4 w-4 text-slate-400" />
            Back to Store
          </Link>

          {/* Separated by a divider: destructive actions never sit flush
              against ordinary navigation. */}
          <div className="border-t border-slate-100">
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await signOut();
                toast.success("Logged out successfully");
                window.location.href = "/";
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-3 text-sm font-medium text-red-600 transition-colors duration-150 hover:bg-red-50"
            >
              <HiLogout className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

export function InvestorTopBar() {
  const isActive = useIsActive();
  const cartCount = useInvestorCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/investor"
          className="flex flex-shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600">
            <HiTrendingUp className="h-5 w-5 text-white" />
          </span>
          <span className="text-base font-bold tracking-tight text-slate-900">Invest</span>
        </Link>

        {/* Desktop links — the same five destinations as the mobile tab bar */}
        <nav aria-label="Investor" className="mx-auto hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.title}
                {item.showBadge && cartCount > 0 && (
                  <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          {/* On mobile the cart lives up here too — it's the one destination
              people reach for mid-task, and the tab bar can be scrolled past. */}
          <Link
            href="/investor/cart"
            aria-label="Invest cart"
            className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-slate-600 transition-colors duration-200 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 md:hidden"
          >
            <HiShoppingCart className="h-5 w-5" />
            <CartBadge count={cartCount} />
          </Link>
          <WalletChip />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom tab bar (mobile only)                                        */
/* ------------------------------------------------------------------ */

export function InvestorTabBar() {
  const isActive = useIsActive();
  const cartCount = useInvestorCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));

  return (
    <nav
      aria-label="Investor"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
      // Keeps the tabs clear of the iOS home indicator.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                // 56px tall, comfortably over the 44px touch-target floor.
                "relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 py-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500",
                active ? "text-emerald-700" : "text-slate-500 active:text-slate-900"
              )}
            >
              {/* Active indicator is a bar AND a colour+weight change, so the
                  current tab is never signalled by colour alone. */}
              <span
                aria-hidden
                className={cn(
                  "absolute top-0 h-0.5 w-10 rounded-full transition-colors duration-200",
                  active ? "bg-emerald-600" : "bg-transparent"
                )}
              />
              <span className="relative">
                <Icon className="h-[22px] w-[22px]" />
                {item.showBadge && <CartBadge count={cartCount} />}
              </span>
              <span
                className={cn(
                  "max-w-full truncate text-[11px] leading-none",
                  active ? "font-semibold" : "font-medium"
                )}
              >
                {item.title}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
