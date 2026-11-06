"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaHome, FaThLarge, FaClipboardList, FaUser } from "react-icons/fa";

const tabs = [
  { label: "Home",       href: "/",          icon: FaHome },
  { label: "Categories", href: "/search",    icon: FaThLarge },
  { label: "Orders",     href: "/orders",    icon: FaClipboardList },
  { label: "Account",    href: "/profile",   icon: FaUser },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-slate-200 safe-area-bottom">
      <div className="grid grid-cols-4 h-14">
        {tabs.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={label}
              href={href}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? "text-brand-gold" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
