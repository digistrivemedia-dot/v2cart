"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MobileBottomNav } from "./MobileBottomNav";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboardPage = pathname.startsWith("/admin") || pathname.startsWith("/vendor");
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");

  if (isDashboardPage || isAuthPage) {
    return <main className="pointer-events-auto">{children}</main>;
  }

  return (
    <>
      <Navbar />
      {/* pb-16 on mobile so content clears the fixed bottom nav */}
      <main className="pointer-events-auto pb-16 lg:pb-0">{children}</main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
