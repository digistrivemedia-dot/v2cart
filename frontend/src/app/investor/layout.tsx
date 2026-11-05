"use client";

import { InvestorTopBar, InvestorTabBar } from "@/components/investor/InvestorNav";
import { RoleGuard } from "@/components/RoleGuard";

/**
 * The investor area deliberately does NOT use DashboardShell (the fixed
 * `ml-64` sidebar frame that /admin and /vendor share) — that layout reads as
 * back-office tooling, and investors are end users, not operators. They get a
 * consumer app bar instead; see components/investor/InvestorNav.tsx.
 */
export default function InvestorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allow={["investor"]} redirectTo="/" loginRedirectTo="/login?redirect=/investor">
      <div className="min-h-dvh bg-slate-50">
        <InvestorTopBar />

        {/* pb-24 keeps the last row of content clear of the fixed mobile tab
            bar; it drops away at md where the tab bar is hidden. */}
        <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 md:pb-10 lg:pt-8">
          {children}
        </main>

        <InvestorTabBar />
      </div>
    </RoleGuard>
  );
}
