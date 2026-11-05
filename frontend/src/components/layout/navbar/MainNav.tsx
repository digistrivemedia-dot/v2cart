"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { FaChevronDown, FaChevronRight, FaBars, FaTimes } from "react-icons/fa";
import { useCategories } from "@/hooks/category";
import { usePathname, useSearchParams } from "next/navigation";

export const MainNav = () => {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [activeSubDropdown, setActiveSubDropdown] = useState<string | null>(null);
  const [subDropdownTop, setSubDropdownTop] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [mobileSubExpanded, setMobileSubExpanded] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const { categories: dbCategories } = useCategories(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevUrl = useRef(`${pathname}?${searchParams.toString()}`);

  // Reset loading when navigation completes
  useEffect(() => {
    const current = `${pathname}?${searchParams.toString()}`;
    if (current !== prevUrl.current) {
      prevUrl.current = current;
      setIsNavigating(false);
    }
  }, [pathname, searchParams]);

  // Safety timeout — always clear after 8s
  useEffect(() => {
    if (!isNavigating) return;
    const timer = setTimeout(() => setIsNavigating(false), 8000);
    return () => clearTimeout(timer);
  }, [isNavigating]);

  const startNavigation = (href: string) => {
    // Don't show loading if already on this URL
    const currentUrl = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    if (currentUrl === href || pathname + window.location.search === href) return;
    setIsNavigating(true);
  };

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const categories = [
    {
      name: "All Products",
      href: "/search",
      slug: "all",
      subcategories: [],
    },
    ...dbCategories.map((category) => ({
      name: category.name,
      href: `/search?category=${category.slug}`,
      slug: category.slug,
      subcategories: (category.children || []).map((child: any) => ({
        name: child.name,
        href: `/search?subcategory=${child.slug}`,
        slug: child.slug,
        children: (child.children || []).map((subChild: any) => ({
          name: subChild.name,
          href: `/search?subsubcategory=${subChild.slug}`,
          slug: subChild.slug,
        })),
      })),
    })),
  ];

  return (
    <>
      {/* ─── LOADING OVERLAY ─── */}
      {isNavigating && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 bg-white rounded-xl shadow-lg px-8 py-6 pointer-events-auto">
              <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-slate-700">Loading…</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── DESKTOP NAV ─── */}
      <nav className="hidden lg:block text-white bg-gradient-to-r from-slate-800 via-slate-700 to-gray-800 border-t border-slate-600/50 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <ul className="flex items-center flex-wrap">
            {categories.map((category) => (
              <li
                key={category.name}
                className="relative group"
                onMouseEnter={() =>
                  category.subcategories.length > 0 && setActiveDropdown(category.name)
                }
                onMouseLeave={() => {
                  setActiveDropdown(null);
                  setActiveSubDropdown(null);
                }}
              >
                <Link
                  href={category.href}
                  onClick={() => startNavigation(category.href)}
                  className="flex items-center gap-1 px-4 py-2 hover:bg-gradient-to-r hover:from-orange-600 hover:to-orange-500 transition-all duration-300 text-sm rounded-md"
                >
                  <span className="whitespace-nowrap">{category.name}</span>
                  {category.subcategories.length > 0 && (
                    <FaChevronDown className="text-xs flex-shrink-0" />
                  )}
                </Link>

                {/* Level 1 Dropdown */}
                {category.subcategories.length > 0 && activeDropdown === category.name && (
                  <div className="absolute left-0 top-full bg-white text-slate-800 shadow-2xl rounded-b-lg min-w-[240px] border border-gray-200" style={{ zIndex: 9999 }}>
                    <ul className="py-2 max-h-[500px] overflow-y-auto overflow-x-visible">
                      {category.subcategories.map((sub: any) => (
                        <li
                          key={sub.name}
                          className="relative"
                          onMouseEnter={(e) => {
                            if (sub.children && sub.children.length > 0) {
                              setActiveSubDropdown(sub.slug);
                              setSubDropdownTop((e.currentTarget as HTMLElement).offsetTop);
                            }
                          }}
                          onMouseLeave={(e) => {
                            const relatedTarget = e.relatedTarget as HTMLElement;
                            if (!relatedTarget?.closest('[data-nested-dropdown]')) {
                              setActiveSubDropdown(null);
                            }
                          }}
                        >
                          <Link
                            href={sub.href}
                            onClick={() => startNavigation(sub.href)}
                            className="flex items-center justify-between px-4 py-2 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                          >
                            <span>{sub.name}</span>
                            {sub.children && sub.children.length > 0 && (
                              <FaChevronRight className="text-xs text-slate-400" />
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>

                    {/* Level 2 Dropdown */}
                    {category.subcategories.map((sub: any) => (
                      sub.children && sub.children.length > 0 && activeSubDropdown === sub.slug && (
                        <div
                          key={`nested-${sub.slug}`}
                          data-nested-dropdown
                          className="absolute left-full bg-white text-slate-800 shadow-2xl rounded-lg min-w-[240px] max-h-[500px] overflow-y-auto border border-gray-200"
                          style={{ zIndex: 10000, top: subDropdownTop }}
                          onMouseEnter={() => setActiveSubDropdown(sub.slug)}
                          onMouseLeave={() => setActiveSubDropdown(null)}
                        >
                          <ul className="py-2">
                            {sub.children.map((subSub: any) => (
                              <li key={subSub.name}>
                                <Link
                                  href={subSub.href}
                                  onClick={() => startNavigation(subSub.href)}
                                  className="block px-4 py-2 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                                >
                                  {subSub.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* ─── MOBILE HAMBURGER BAR ─── */}
      <div className="lg:hidden bg-gradient-to-r from-slate-800 via-slate-700 to-gray-800 border-t border-slate-600/50">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-white text-sm font-semibold tracking-wide">Browse Categories</span>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="text-white p-2 rounded-lg hover:bg-slate-600 transition-colors"
          >
            <FaBars size={22} />
          </button>
        </div>
      </div>

      {/* ─── MOBILE DRAWER OVERLAY ─── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[1000] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ─── MOBILE DRAWER PANEL ─── */}
      <div
        className={`fixed top-0 left-0 h-full w-[300px] max-w-[85vw] bg-white z-[1001] shadow-2xl transform transition-transform duration-300 ease-in-out lg:hidden flex flex-col ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-red-600 to-orange-500 shrink-0">
          <span className="text-white font-bold text-lg">Categories</span>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="text-white p-1 rounded-lg hover:bg-white/20 transition-colors"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Scrollable Category List */}
        <nav className="flex-1 overflow-y-auto overscroll-contain">
          <ul className="py-2">
            {categories.map((category) => (
              <li key={category.name} className="border-b border-gray-100 last:border-0">
                {category.subcategories.length === 0 ? (
                  // No subcategories — direct link
                  <Link
                    href={category.href}
                    onClick={() => { startNavigation(category.href); setMobileOpen(false); }}
                    className="flex items-center px-5 py-3.5 text-slate-800 font-medium hover:bg-orange-50 hover:text-orange-600 transition-colors"
                  >
                    {category.name}
                  </Link>
                ) : (
                  // Has subcategories — accordion toggle
                  <>
                    <button
                      onClick={() =>
                        setMobileExpanded(mobileExpanded === category.slug ? null : category.slug)
                      }
                      className="w-full flex items-center justify-between px-5 py-3.5 text-slate-800 font-medium hover:bg-orange-50 transition-colors"
                    >
                      <span>{category.name}</span>
                      <FaChevronDown
                        className={`text-orange-500 text-xs transition-transform duration-200 ${mobileExpanded === category.slug ? "rotate-180" : ""
                          }`}
                      />
                    </button>

                    {/* Level 1 Subcategories */}
                    {mobileExpanded === category.slug && (
                      <ul className="bg-slate-50">
                        {/* Direct link to category */}
                        <li>
                          <Link
                            href={category.href}
                            onClick={() => { startNavigation(category.href); setMobileOpen(false); }}
                            className="flex items-center px-8 py-2.5 text-sm text-orange-600 font-medium hover:bg-orange-50 transition-colors"
                          >
                            View All {category.name}
                          </Link>
                        </li>
                        {category.subcategories.map((sub: any) => (
                          <li key={sub.name} className="border-t border-gray-100">
                            {sub.children && sub.children.length > 0 ? (
                              <>
                                <button
                                  onClick={() =>
                                    setMobileSubExpanded(
                                      mobileSubExpanded === sub.slug ? null : sub.slug
                                    )
                                  }
                                  className="w-full flex items-center justify-between px-8 py-2.5 text-sm text-slate-700 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                                >
                                  <span>{sub.name}</span>
                                  <FaChevronDown
                                    className={`text-slate-400 text-xs transition-transform duration-200 ${mobileSubExpanded === sub.slug ? "rotate-180" : ""
                                      }`}
                                  />
                                </button>

                                {/* Level 2 Sub-subcategories */}
                                {mobileSubExpanded === sub.slug && (
                                  <ul className="bg-white">
                                    <li>
                                      <Link
                                        href={sub.href}
                                        onClick={() => { startNavigation(sub.href); setMobileOpen(false); }}
                                        className="flex items-center pl-12 pr-5 py-2 text-xs text-orange-500 font-medium hover:bg-orange-50 transition-colors"
                                      >
                                        View All {sub.name}
                                      </Link>
                                    </li>
                                    {sub.children.map((subSub: any) => (
                                      <li key={subSub.name}>
                                        <Link
                                          href={subSub.href}
                                          onClick={() => { startNavigation(subSub.href); setMobileOpen(false); }}
                                          className="flex items-center pl-12 pr-5 py-2 text-xs text-slate-600 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                                        >
                                          <FaChevronRight className="text-orange-300 mr-2 text-[9px]" />
                                          {subSub.name}
                                        </Link>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            ) : (
                              <Link
                                href={sub.href}
                                onClick={() => { startNavigation(sub.href); setMobileOpen(false); }}
                                className="flex items-center px-8 py-2.5 text-sm text-slate-700 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                              >
                                <FaChevronRight className="text-orange-300 mr-2 text-[9px]" />
                                {sub.name}
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Drawer Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-gray-200 bg-slate-50">
          <Link
            href="tel:+919738522119"
            className="flex items-center gap-2 text-slate-600 text-sm hover:text-orange-600 transition-colors"
          >
            <span>📞</span>
            <span>097385 22119</span>
          </Link>
        </div>
      </div>
    </>
  );
};
