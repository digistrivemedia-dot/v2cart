"use client";

import { useSession } from "@/lib/auth/client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

export type Role = "user" | "vendor" | "investor" | "admin";

interface RoleGuardProps {
  allow: Role[];
  children: React.ReactNode;
  /** Where to send an authenticated-but-wrong-role user. Defaults to "/". */
  redirectTo?: string;
  /** Where to send an unauthenticated user. Defaults to "/login". */
  loginRedirectTo?: string;
}

/**
 * Shared auth+role gate for the admin/vendor/investor dashboards. Replaces
 * the duplicated inline checks that used to live separately in
 * admin/layout.tsx and the (unused) AdminGuard.tsx.
 */
export function RoleGuard({
  allow,
  children,
  redirectTo = "/",
  loginRedirectTo = "/login",
}: RoleGuardProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const role = (session?.user as any)?.role;
  const isAllowed = !!session?.user && allow.includes(role);

  useEffect(() => {
    if (isPending) return;

    if (!session?.user) {
      toast.error("Please login to continue");
      router.push(loginRedirectTo);
      return;
    }

    if (!isAllowed) {
      toast.error("You don't have permission to access this page");
      router.push(redirectTo);
    }
  }, [isPending, session, isAllowed, router, redirectTo, loginRedirectTo]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}
