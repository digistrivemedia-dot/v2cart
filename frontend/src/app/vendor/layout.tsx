"use client";

import { VendorSidebar } from "@/components/vendor/VendorSidebar";
import { RoleGuard } from "@/components/RoleGuard";
import { DashboardShell } from "@/components/DashboardShell";

export default function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allow={["vendor"]} redirectTo="/" loginRedirectTo="/login?redirect=/vendor">
      <DashboardShell sidebar={<VendorSidebar />}>{children}</DashboardShell>
    </RoleGuard>
  );
}
