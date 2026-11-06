"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FaPhone, FaStore, FaSearch, FaUser, FaUserCircle, FaSignOutAlt, FaBox } from "react-icons/fa";
import { useSession } from "@/lib/auth/client";
import { useAuthMutation } from "@/hooks/auth/useAuthMutation";

import { WishlistLink } from "./WishlistLink";
import { CartLink } from "./CartLink";
import type { Manager } from "@/hooks/useManager";
import { config } from "@/constants/config";

export const TopBar = ({ editProfileManager }: { editProfileManager: Manager }) => {
  const { data: session, isPending } = useSession();
  const [mounted, setMounted] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mobileSearch, setMobileSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { signOut } = useAuthMutation();
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  const handleMobileSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (mobileSearch.trim()) {
      router.push(`/search?q=${encodeURIComponent(mobileSearch.trim())}`);
    } else {
      router.push("/search");
    }
  };

  /* ── Shared account dropdown content ── */
  const AccountDropdown = () =>
    showDropdown ? (
      <div
        onMouseLeave={() => setShowDropdown(false)}
        className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
      >
        <div className="bg-gradient-to-r from-brand-navy to-brand-navy-dark px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
              <FaUserCircle className="text-brand-navy" size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{session?.user?.name || "User"}</p>
              <p className="text-white/80 text-xs truncate">{session?.user?.email}</p>
            </div>
          </div>
        </div>
        <div className="py-2">
          <Link href="/profile" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-amber-50 transition-colors group">
            <FaUserCircle className="text-slate-400 group-hover:text-brand-gold transition-colors" size={18} />
            <span className="text-sm font-medium">My Profile</span>
          </Link>
          <Link href="/orders" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-4 py-3 text-slate-700 hover:bg-amber-50 transition-colors group">
            <FaBox className="text-slate-400 group-hover:text-brand-gold transition-colors" size={18} />
            <span className="text-sm font-medium">My Orders</span>
          </Link>
          <div className="border-t border-slate-200 my-2" />
          <button
            onClick={() => { setShowDropdown(false); signOut.mutate(); }}
            disabled={signOut.isPending}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors group disabled:opacity-60"
          >
            <FaSignOutAlt className="text-red-400 group-hover:text-red-600 transition-colors" size={18} />
            <span className="text-sm font-medium">{signOut.isPending ? "Logging out…" : "Logout"}</span>
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      {/* ════════════════════════════════════════
          MOBILE TOP BAR  (hidden on lg+)
          ════════════════════════════════════════ */}
      <div className="lg:hidden bg-white border-b border-slate-100 shadow-sm">
        {/* Row 1: Logo + Action Icons */}
        <div className="flex items-center justify-between px-3 py-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-white border border-slate-100">
              <Image src="/logo.jpeg" alt={config.appName} fill className="object-contain p-0.5" priority />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-extrabold text-brand-navy tracking-tight">{config.appName}</p>
              <p className="text-[9px] text-slate-400 leading-none">{config.appTagline}</p>
            </div>
          </Link>

          {/* Icons */}
          <div className="flex items-center gap-1">
            {/* Search icon (opens search page) */}
            <Link href="/search" className="p-2 text-slate-600 hover:text-brand-blue transition-colors" aria-label="Search">
              <FaSearch size={16} />
            </Link>

            {/* Account */}
            {!mounted || isPending ? (
              <div className="w-8 h-8 bg-slate-200 rounded-full animate-pulse" />
            ) : session?.user ? (
              <div className="relative" ref={dropdownRef}>
                <button onClick={() => setShowDropdown(!showDropdown)} className="p-2 text-slate-600 hover:text-brand-blue transition-colors" aria-label="Account">
                  <FaUser size={16} />
                </button>
                <AccountDropdown />
              </div>
            ) : (
              <Link href="/login" className="p-2 text-slate-600 hover:text-brand-blue transition-colors" aria-label="Sign in">
                <FaUser size={16} />
              </Link>
            )}

            {/* Wishlist */}
            <WishlistLink />

            {/* Cart */}
            <CartLink />
          </div>
        </div>

        {/* Row 2: Search Bar */}
        <form onSubmit={handleMobileSearch} className="px-3 pb-2">
          <div className="flex items-center bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
            <input
              type="search"
              value={mobileSearch}
              onChange={(e) => setMobileSearch(e.target.value)}
              placeholder="Search for products, brands and more..."
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 px-3 py-2 focus:outline-none"
            />
            <button type="submit" className="bg-brand-blue hover:bg-brand-blue-light px-3 py-2 transition-colors" aria-label="Search">
              <FaSearch className="text-white" size={14} />
            </button>
          </div>
        </form>
      </div>

      {/* ════════════════════════════════════════
          DESKTOP TOP BAR  (hidden below lg)
          ════════════════════════════════════════ */}
      <div className="hidden lg:block text-white bg-brand-navy">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <div className="flex items-center">
              <Link href="/" className="flex items-center group">
                <div className="relative w-16 h-16 mr-3 rounded-lg shadow-lg overflow-hidden bg-white transition-transform duration-300 group-hover:scale-105">
                  <Image src="/logo.jpeg" alt={config.appName} fill className="object-contain p-1" priority />
                </div>
                <div>
                  <h1 className="text-xl leading-5 font-bold text-white">{config.appName}</h1>
                  <p className="text-xs text-brand-gold-light">{config.appTagline}</p>
                </div>
              </Link>
            </div>

            {/* Center links */}
            <nav className="flex items-center gap-8 text-sm">
              <Link href="/" className="text-white hover:text-brand-gold-light transition-colors font-medium">Home</Link>
              <Link href="/blogs" className="text-white hover:text-brand-gold-light transition-colors">Blog</Link>
              <Link href="/Gallery" className="text-white hover:text-brand-gold-light transition-colors">Gallery</Link>
            </nav>

            {/* Right icons */}
            <div className="flex items-center gap-4">
              <Link href={`tel:${config.contact.phone.replace(/\s/g, "")}`} className="hidden xl:flex items-center gap-2 text-white hover:text-brand-gold-light transition-colors">
                <FaPhone className="text-brand-gold-light" size={16} />
                <span className="text-sm">{config.contact.phone}</span>
              </Link>
              <Link href="/search" className="flex flex-col items-center justify-center text-white hover:text-brand-gold-light transition-colors" title="Store">
                <FaStore size={20} />
                <span className="text-xs mt-1">Store</span>
              </Link>
              <Link href="/search" className="flex flex-col items-center justify-center text-white hover:text-brand-gold-light transition-colors" title="Search">
                <FaSearch size={20} />
                <span className="text-xs mt-1">Search</span>
              </Link>

              {/* Account */}
              {!mounted || isPending ? (
                <div className="w-12 h-12 bg-gray-700 rounded-full animate-pulse" />
              ) : session?.user ? (
                <div className="relative" ref={dropdownRef}>
                  <button onMouseEnter={() => setShowDropdown(true)} onClick={() => setShowDropdown(!showDropdown)} className="flex flex-col items-center justify-center text-white hover:text-brand-gold-light transition-colors">
                    <div className="w-8 h-8 bg-brand-gold rounded-full flex items-center justify-center">
                      <FaUser size={14} />
                    </div>
                    <span className="text-xs mt-1">Account</span>
                  </button>
                  <AccountDropdown />
                </div>
              ) : (
                <Link href="/login" className="flex flex-col items-center justify-center text-white hover:text-brand-gold-light transition-colors">
                  <FaUser size={20} />
                  <span className="text-xs mt-1">Sign In</span>
                </Link>
              )}

              <div className="flex flex-col items-center justify-center">
                <WishlistLink />
                <span className="text-xs mt-1 text-white">Wishlist</span>
              </div>
              <div className="flex flex-col items-center justify-center">
                <CartLink />
                <span className="text-xs mt-1 text-white">Cart</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
