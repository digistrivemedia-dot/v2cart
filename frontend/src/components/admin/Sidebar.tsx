"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/client";
import { toast } from "sonner";
import { config } from "@/constants/config";
import {
  HiHome,
  HiShoppingBag,
  HiFolder,
  HiClipboardList,
  HiNewspaper,
  HiTag,
  HiUsers,
  HiCog,
  HiLogout,
  HiOfficeBuilding,
  HiChartBar,
} from "react-icons/hi";

const sidebarItems = [
  {
    title: "Dashboard",
    href: "/admin",
    icon: HiHome,
  },
  {
    title: "Products",
    href: "/admin/products",
    icon: HiShoppingBag,
  },
  {
    title: "Categories",
    href: "/admin/categories",
    icon: HiFolder,
  },
  {
    title: "Orders",
    href: "/admin/orders",
    icon: HiClipboardList,
  },
  {
    title: "Blogs",
    href: "/admin/blogs",
    icon: HiNewspaper,
  },
  {
    title: "Coupons",
    href: "/admin/coupons",
    icon: HiTag,
  },
  {
    title: "Customers",
    href: "/admin/customers",
    icon: HiUsers,
  },
  {
    title: "Vendors",
    href: "/admin/vendors",
    icon: HiOfficeBuilding,
  },
  {
    title: "Reports",
    href: "/admin/reports",
    icon: HiChartBar,
  },
  {
    title: "Settings",
    href: "/admin/settings",
    icon: HiCog,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="h-full w-64 bg-slate-900 text-white border-r border-slate-800 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex-shrink-0 flex items-center px-6 pr-12 lg:pr-6 border-b border-slate-800">
        <Link href="/admin" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <HiShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg">{config.appName} Admin</h1>
            <p className="text-xs text-slate-400">Management Panel</p>
          </div>
        </Link>
      </div>

      {/* Navigation — scrolls independently so long menus never overflow the screen */}
      <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                isActive
                  ? "bg-orange-500 text-white shadow-lg"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.title}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 p-4 border-t border-slate-800 space-y-2">
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          <span>Back to Store</span>
        </Link>
        <button
          onClick={async () => {
            await signOut();
            toast.success("Logged out successfully");
            window.location.href = "/";
          }}
          className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-red-400 hover:text-white hover:bg-red-600 transition-colors"
        >
          <HiLogout className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
