"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboardPage = pathname.startsWith("/admin") || pathname.startsWith("/vendor") || pathname.startsWith("/investor");
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");

  if (isDashboardPage || isAuthPage) {
    return <main className="pointer-events-auto">{children}</main>;
  }

  return (
    <>
      <Navbar />
      <main className="pointer-events-auto">{children}</main>
      <Footer />
    </>
  );
}
