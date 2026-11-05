"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { HiMenu, HiX } from "react-icons/hi";

/**
 * Shared sidebar + content layout for the admin/vendor dashboards.
 * Below lg the sidebar becomes an off-canvas drawer behind a hamburger bar;
 * from lg up it is the usual fixed 16rem rail.
 */
interface DashboardShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardShell({ sidebar, children }: DashboardShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating inside the drawer should close it.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 text-white">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="-ml-2 rounded-lg p-2 hover:bg-slate-800"
        >
          <HiMenu className="h-6 w-6" />
        </button>
        <span className="font-semibold">Dashboard</span>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      {/* Sidebar: drawer under lg, fixed rail from lg */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {open && (
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-300 hover:bg-slate-800 lg:hidden"
          >
            <HiX className="h-5 w-5" />
          </button>
        )}
        {sidebar}
      </div>

      <main className="p-4 sm:p-6 lg:ml-64 lg:p-8">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
