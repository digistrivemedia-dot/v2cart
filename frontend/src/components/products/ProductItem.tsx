"use client";

/** COMPONENTS */
import { ProductImage } from "./ProductImage";
import Link from "next/link";
/** FUNCTIONALITY */
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useState } from "react";
import { FiChevronDown } from "react-icons/fi";
/** TYPES */
import type { ProductWithVariants } from "@/schemas";
import type { InvestorMetrics } from "@/lib/investor/metrics";
import { formatWait } from "@/lib/investor/metrics";
import { SalesSparkline, FundingMeter, MarginTierBadge } from "../investor/InvestorCharts";
import { Pct } from "../investor/Pct";

const WishlistButton = dynamic(
  () => import("../wishlist/WishlistButton")
);

interface ProductItemProps {
  product: ProductWithVariants;
  /** 'investor' swaps the bottom CTA for a quantity stepper + Add to Invest Cart (see /investor/products). */
  variant?: "customer" | "investor";
  investorPrice?: number;
  /** Fixed amount the investor gets back when their funded unit sells. */
  investorPayout?: number;
  /** Units still open for investment on this product (investableUnits minus units already funded). */
  remainingUnits?: number;
  /** Units already funded by investors — drives the funding progress bar. */
  investedUnits?: number;
  /** Total units that can ever be investor-funded on this product. */
  investableUnits?: number;
  /**
   * Sell-speed analytics for the investor variant. Every product returns the
   * same margin %, so these are what actually differentiate listings — how
   * fast it sells and how long the queue is. See lib/investor/metrics.ts.
   */
  analytics?: InvestorMetrics;
  onAddToInvestCart?: (quantity: number) => void;
}

/**
 * A block that collapses to one line.
 *
 * The investor card carried two tall always-open panels — the economics and
 * the sell-speed analytics — which made each card roughly twice the height of
 * a customer card and pushed the Add button below the fold in a grid.
 *
 * `summary` is what stays visible when closed, and it is deliberately the
 * figures an investor compares on: collapsing to just a title would shrink
 * the card by making it useless. Closed by default, and the open state is
 * per-card so expanding one doesn't shift the rest of the row.
 */
function CollapsibleBlock({
  title,
  summary,
  tone = "slate",
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: React.ReactNode;
  tone?: "slate" | "emerald";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const palette =
    tone === "emerald"
      ? { wrap: "border-emerald-100 bg-emerald-50/60", chevron: "text-emerald-600" }
      : { wrap: "border-slate-200 bg-white", chevron: "text-slate-400" };

  return (
    <div className={`rounded-lg border ${palette.wrap}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">{summary}</div>
        <FiChevronDown
          aria-hidden="true"
          className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${palette.chevron} ${open ? "rotate-180" : ""}`}
        />
        <span className="sr-only">
          {open ? `Hide ${title}` : `Show ${title}`}
        </span>
      </button>
      {open && <div className="border-t border-black/5 px-3 pb-3 pt-2.5">{children}</div>}
    </div>
  );
}

const tagConfig: Record<string, { color: string; emoji: string }> = {
  popular:    { color: "bg-blue-100 text-blue-700",   emoji: "⭐" },
  trending:   { color: "bg-yellow-100 text-yellow-700", emoji: "🔥" },
  new:        { color: "bg-green-100 text-green-700",  emoji: "✨" },
  premium:    { color: "bg-purple-100 text-purple-700", emoji: "💎" },
  exclusive:  { color: "bg-pink-100 text-pink-700",   emoji: "👑" },
  classic:    { color: "bg-slate-100 text-slate-700",  emoji: "🏛️" },
  bestseller: { color: "bg-orange-100 text-orange-700", emoji: "🏆" },
  limited:    { color: "bg-red-100 text-red-700",     emoji: "⏰" },
};

export const ProductItem = ({
  product,
  variant = "customer",
  investorPrice,
  investorPayout,
  remainingUnits,
  investedUnits,
  investableUnits,
  analytics,
  onAddToInvestCart,
}: ProductItemProps) => {
  const { name, id, img, price, category, variants } = product;
  // Undefined (rather than 0) when a caller doesn't supply stock, so a missing
  // field never reads as "out of stock".
  const stock: number | undefined = (product as any).stock;
  const isOutOfStock = stock !== undefined && stock <= 0;
  const cuttedPrice = (product as any).cuttedPrice;
  const tags: string[] = (product as any).tags || [];
  const shortDescription = (product as any).shortDescription || (product as any).description || "";
  const discount = price > 0 && cuttedPrice > price
    ? Math.round(((cuttedPrice - price) / cuttedPrice) * 100)
    : 0;
  const maxQuantity = Math.max(remainingUnits ?? 0, 0);
  const [investQuantity, setInvestQuantity] = useState(1);

  // Investor-only derived numbers: profit per unit as a % of capital in, and
  // how much of this listing's investable stock other investors already took.
  const unitInvest = investorPrice ?? 0;
  const unitPayout = investorPayout ?? 0;
  const roi = unitInvest > 0 ? ((unitPayout - unitInvest) / unitInvest) * 100 : 0;
  const fundedPct =
    investableUnits && investableUnits > 0
      ? Math.min(100, ((investedUnits ?? 0) / investableUnits) * 100)
      : 0;

  // Safely get the first variant color
  const firstVariantColor = variants && variants.length > 0 ? variants[0].color : 'default';
  const productLink = `/${category}/${id}?variant=${firstVariantColor}`;

  const isInvestor = variant === "investor";
  // Investor cards deliberately never link anywhere — the customer product
  // page they'd otherwise land on has its own real Add to Cart → Checkout,
  // which is exactly the flow investors must never end up in. Everything an
  // investor needs (name, image, price, description) is already on the card.
  const ImageWrapper = isInvestor ? "div" : Link;
  const imageWrapperProps = isInvestor ? {} : { href: productLink };
  const TitleWrapper = isInvestor ? "div" : Link;
  const titleWrapperProps = isInvestor ? {} : { href: productLink };

  return (
    <div className="group bg-white rounded-lg shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-200">
      {/* Image Container */}
      <ImageWrapper {...(imageWrapperProps as any)} className="block relative overflow-hidden">
        <div className="relative aspect-[4/3]">
          <ProductImage
            image={img}
            name={name}
            width={400}
            height={400}
            sizes="(max-width: 640px) 100vw, (max-width: 1154px) 33vw, (max-width: 1536px) 25vw, 20vw"
          />
          <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
          {isOutOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
                Out of stock
              </span>
            </div>
          )}
        </div>

        {/* Discount Badge */}
        {discount > 0 && (
          <div className="absolute bottom-3 left-3 z-10">
            <span className="px-2 py-1 bg-green-500 text-white text-xs font-bold rounded">
              -{discount}%
            </span>
          </div>
        )}

        {/* Wishlist Button - Overlay on Image (customer only — investors don't have a wishlist) */}
        {!isInvestor && (
          <div className="absolute top-3 right-3 z-10">
            <WishlistButton productId={id} />
          </div>
        )}
      </ImageWrapper>

      {/* Product Info */}
      <div className="p-4">
        <TitleWrapper {...(titleWrapperProps as any)}>
          <h3 className="text-base font-semibold text-slate-800 mb-2 line-clamp-2 hover:text-orange-500 transition-colors min-h-[3rem]">
            {name}
          </h3>
        </TitleWrapper>

        {/* Price and Size */}
        <div className="flex items-center justify-between mt-3">
          <div>
            {price > 0 ? (
              <div>
                <div className="flex items-baseline gap-2">
                  <p className="text-xl font-bold text-orange-500">₹{price.toFixed(0)}</p>
                  {cuttedPrice > price && (
                    <p className="text-sm text-gray-400 line-through">₹{cuttedPrice.toFixed(0)}</p>
                  )}
                </div>
                {/* The big price is the *customer* price — label it for investors
                    so it isn't mistaken for what they'd be putting in. */}
                {isInvestor && <p className="text-xs text-gray-500">Retail price</p>}
              </div>
            ) : (
              <>
                <p className="text-base font-semibold text-blue-600">Get Price</p>
                <p className="text-xs text-gray-500">Contact us</p>
              </>
            )}
          </div>

          {/* @ts-ignore - dummy data uses 'size', real schema uses 'sizes' */}
          {(variants[0]?.sizes?.[0] || variants[0]?.size) && (
            <div className="text-right">
              {/* @ts-ignore - dummy data uses 'size', real schema uses 'sizes' */}
              <p className="text-sm font-medium text-slate-700">{variants[0]?.sizes?.[0] || variants[0]?.size}"</p>
              <p className="text-xs text-gray-500">Size</p>
            </div>
          )}
        </div>

        {/* Color Variants */}
        {variants && variants.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-600 mb-2">{variants.length} Variant{variants.length > 1 ? 's' : ''} Available</p>
            <div className="flex flex-wrap gap-1.5">
              {variants.slice(0, 3).map((variant: any, idx: number) => (
                <span
                  key={idx}
                  className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded border border-gray-200"
                  title={variant.color}
                >
                  {variant.color}
                </span>
              ))}
              {variants.length > 3 && (
                <span className="px-2 py-1 text-xs font-medium bg-orange-50 text-orange-600 rounded border border-orange-200">
                  +{variants.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}


        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => {
              const cfg = tagConfig[tag];
              if (!cfg) return null;
              return (
                <span key={tag} className={`px-2 py-0.5 text-xs font-medium rounded-full ${cfg.color}`}>
                  {cfg.emoji} {tag.charAt(0).toUpperCase() + tag.slice(1)}
                </span>
              );
            })}
          </div>
        )}

        {/* Short Description */}
        {shortDescription && (
          <p className="mt-2 text-xs text-gray-500 line-clamp-2">{shortDescription}</p>
        )}

        {/* View Details / Invest Button */}
        {variant === "investor" ? (
          <div className="mt-4 space-y-3">
            {/* Investment economics. Collapsed to the one line that matters —
                in at ₹X, out at ₹Y, and the return — with the per-unit
                profit breakdown behind the chevron. */}
            <CollapsibleBlock
              title="investment economics"
              tone="emerald"
              summary={
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    ₹{unitInvest.toLocaleString("en-IN")}
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    →
                  </span>
                  <span className="text-sm font-bold text-emerald-700 tabular-nums">
                    ₹{unitPayout.toLocaleString("en-IN")}
                  </span>
                  {/* Navy rather than emerald: brand gold on emerald-600 is
                      1.80:1, on navy it's 8.02:1. */}
                  <span className="ml-auto rounded-full bg-brand-navy px-2 py-0.5 text-xs">
                    <Pct onDark className="text-xs font-bold">
                      {roi >= 0 ? "+" : ""}
                      {roi.toFixed(1)}%
                    </Pct>
                  </span>
                </div>
              }
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">You invest</p>
                    <p className="text-base font-bold text-slate-900">
                      ₹{unitInvest.toLocaleString("en-IN")}
                      <span className="text-xs font-normal text-slate-500"> / unit</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">You get back</p>
                    <p className="text-base font-bold text-emerald-700">
                      ₹{unitPayout.toLocaleString("en-IN")}
                    </p>
                    <p className="text-[11px] text-slate-500">at its current band</p>
                  </div>
                </div>

                {/* The payout depends on how long the unit takes to sell, so a
                    single figure would be a guess shown as a fact. These three
                    rows are the actual deal. */}
                {analytics && analytics.payoutRange.length === 3 && (
                  <div className="border-t border-emerald-100 pt-2">
                    <p className="text-[11px] text-slate-500 mb-1">
                      What you get back depends on how fast your unit sells
                    </p>
                    <div className="space-y-1">
                      {analytics.payoutRange.map((b) => (
                        <div
                          key={b.band}
                          className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs ${
                            b.band === analytics.marginTier
                              ? "bg-emerald-50 font-semibold text-slate-900"
                              : "text-slate-600"
                          }`}
                        >
                          <span>
                            {b.band === "high"
                              ? `over ${analytics.marginBands.medium.days}d`
                              : `within ${b.days}d`}
                          </span>
                          <span className="tabular-nums">
                            ₹{b.payout.toLocaleString("en-IN")}
                            <span className="ml-1 font-normal text-slate-500">(+{b.pct}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Phase 21 — the wait does not end at the sale. Said here
                        because it is dead time the investor is signing up for:
                        estDaysToSale is how long until a buyer, this is how
                        long after that until the money is theirs. */}
                    {analytics.returnPolicy === "full" && analytics.returnWindowDays > 0 ? (
                      <p className="mt-2 border-t border-emerald-100 pt-2 text-[11px] text-slate-500">
                        Paid{" "}
                        <span className="font-medium text-slate-700">
                          {analytics.returnWindowDays} day
                          {analytics.returnWindowDays === 1 ? "" : "s"} after delivery
                        </span>
                        , once the customer&apos;s return window closes. A return puts your
                        unit back in the queue to sell again.
                      </p>
                    ) : (
                      <p className="mt-2 border-t border-emerald-100 pt-2 text-[11px] text-slate-500">
                        Paid{" "}
                        <span className="font-medium text-slate-700">on delivery</span> — this
                        product isn&apos;t refundable, so there is no window to wait out.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 border-t border-emerald-100 pt-2">
                  <span className="text-xs text-slate-600">
                    Profit ₹{Math.max(unitPayout - unitInvest, 0).toLocaleString("en-IN")} / unit
                  </span>
                  <span className="rounded-full bg-brand-navy px-2 py-0.5 text-xs">
                    <Pct onDark className="text-xs font-bold">
                      {roi >= 0 ? "+" : ""}
                      {roi.toFixed(1)}% return
                    </Pct>
                  </span>
                </div>
              </div>
            </CollapsibleBlock>

            {/* Sell-speed analytics. The band above says WHAT a wait earns;
                this says how long that wait is likely to be — how fast the
                product sells and how many units are queued ahead. The two
                together are the investment. */}
            {analytics && (
              <CollapsibleBlock
                title="margin band & speed"
                summary={
                  <div className="flex items-center gap-2">
                    <MarginTierBadge
                      tier={analytics.marginTier}
                      marginBands={analytics.marginBands}
                      estDaysToSale={analytics.estDaysToSale}
                    />
                    {analytics.annualisedReturn !== null && (
                      <Pct
                        className="ml-auto text-sm font-bold"
                        title="The return above, scaled by how fast your capital comes back. Simple (non-compounded) annualised rate."
                      >
                        ≈{analytics.annualisedReturn.toFixed(0)}%
                        <span className="text-[11px] font-normal text-slate-500">/yr</span>
                      </Pct>
                    )}
                  </div>
                }
              >
              <div className="space-y-2.5">
                <div>
                  <p className="text-[11px] text-slate-500 mb-1">
                    Units sold per week ({analytics.salesWindowWeeks}w)
                  </p>
                  <SalesSparkline data={analytics.salesByWeek} showAxis />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-[11px]">
                  <div>
                    <p className="text-slate-500">Selling</p>
                    <p className="font-semibold text-slate-900 tabular-nums">
                      {analytics.velocityPerWeek > 0
                        ? `${analytics.velocityPerWeek.toFixed(1)}/wk`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Queue ahead of you</p>
                    <p className="font-semibold text-slate-900 tabular-nums">
                      {analytics.queueAhead} unit{analytics.queueAhead === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Est. wait for your unit</p>
                    <p className="font-semibold text-slate-900 tabular-nums">
                      {formatWait(analytics.estDaysToSale)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500" title="Observed average across units that have already sold">
                      Past avg wait
                    </p>
                    <p className="font-semibold text-slate-900 tabular-nums">
                      {formatWait(analytics.avgDaysToMatch)}
                    </p>
                  </div>
                </div>
              </div>
              </CollapsibleBlock>
            )}

            {/* Funding progress — social proof on which listings are moving */}
            {investableUnits != null && investableUnits > 0 && (
              <FundingMeter
                pct={fundedPct}
                investedUnits={investedUnits ?? 0}
                investableUnits={investableUnits}
              />
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Quantity</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInvestQuantity((q) => Math.max(1, q - 1))}
                  className="w-7 h-7 flex items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-medium">{investQuantity}</span>
                <button
                  type="button"
                  onClick={() => setInvestQuantity((q) => Math.min(Math.max(maxQuantity, 1), q + 1))}
                  disabled={investQuantity >= maxQuantity || isOutOfStock}
                  className="w-7 h-7 flex items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onAddToInvestCart?.(investQuantity)}
              disabled={maxQuantity <= 0 || isOutOfStock}
              className="w-full py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors duration-300 text-sm font-medium disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {/* Nothing in stock and every unit already funded are different
                  problems — one needs the vendor to restock, the other needs
                  another investor to be outbid. Don't label them the same. */}
              {isOutOfStock
                ? "Out of stock"
                : maxQuantity > 0
                  ? `Add to Invest Cart (₹${(unitInvest * investQuantity).toLocaleString("en-IN")})`
                  : "Fully funded"}
            </button>
            <p className="text-xs text-gray-500 text-center">
              {isOutOfStock
                ? "The vendor has no units in stock to fund right now"
                : maxQuantity > 0
                  ? `${maxQuantity} unit${maxQuantity > 1 ? "s" : ""} left to invest in`
                  : "No units left to invest in right now"}
            </p>
          </div>
        ) : (
          <Link href={productLink}>
            <button
              className={`w-full mt-4 py-2.5 rounded-lg transition-colors duration-300 text-sm font-medium ${
                isOutOfStock
                  ? "bg-slate-200 text-slate-600 hover:bg-slate-300"
                  : "bg-slate-900 text-white hover:bg-orange-500"
              }`}
            >
              {isOutOfStock ? "Out of Stock — View Details" : "View Details"}
            </button>
          </Link>
        )}
      </div>
    </div>
  );
};
