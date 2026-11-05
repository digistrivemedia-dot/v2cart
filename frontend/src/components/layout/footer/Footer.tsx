"use client";

import Link from "next/link";
import Image from "next/image";
import {
  FaFacebook,
  FaInstagram,
  FaTwitter,
  FaLinkedin,
  FaPhone,
  FaEnvelope,
} from "react-icons/fa";
import { config } from "@/constants/config";

export const Footer = () => {
  const linkStyles = "text-sm text-white transition duration-150 ease hover:text-brand-gold-light";
  const liStyles = "text-white my-2";
  const headingStyles = "text-lg font-semibold mb-4 bg-gradient-to-r from-brand-gold to-brand-gold-light bg-clip-text text-transparent";

  return (
    <footer className="text-white mt-20 bg-gradient-to-r from-brand-navy via-brand-navy to-brand-navy-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {/* Company Info */}
          <div>
            {/* Logo */}
            <div className="mb-4">
              <Image
                src="/logo.png"
                alt={`${config.appName} Logo`}
                width={96}
                height={96}
                className="rounded-lg shadow-lg bg-white p-2"
              />
            </div>
            <h3 className={`text-xl font-bold mb-4 bg-gradient-to-r from-brand-gold to-brand-gold-light bg-clip-text text-transparent`}>{config.appName}</h3>
            <p className="text-white text-sm mb-4">
              {config.appDescription}
            </p>
            <div className="flex gap-4 mt-6">
              <a
                href="#"
                className="w-10 h-10 bg-white/10 hover:bg-brand-gold rounded-full flex items-center justify-center transition-colors"
                aria-label="Facebook"
              >
                <FaFacebook />
              </a>
              <a
                href={config.contact.instagram}
                className="w-10 h-10 bg-white/10 hover:bg-brand-gold rounded-full flex items-center justify-center transition-colors"
                aria-label="Instagram"
              >
                <FaInstagram />
              </a>
              <a
                href="#"
                className="w-10 h-10 bg-white/10 hover:bg-brand-gold rounded-full flex items-center justify-center transition-colors"
                aria-label="Twitter"
              >
                <FaTwitter />
              </a>
              <a
                href="#"
                className="w-10 h-10 bg-white/10 hover:bg-brand-gold rounded-full flex items-center justify-center transition-colors"
                aria-label="LinkedIn"
              >
                <FaLinkedin />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className={headingStyles}>Quick Links</h3>
            <ul>
              <li className={liStyles}>
                <Link href="/" className={linkStyles}>
                  Home
                </Link>
              </li>
              <li className={liStyles}>
                <Link href="/search" className={linkStyles}>
                  Search Products
                </Link>
              </li>
              <li className={liStyles}>
                <Link href="/cart" className={linkStyles}>
                  Shopping Cart
                </Link>
              </li>
              <li className={liStyles}>
                <Link href="/wishlist" className={linkStyles}>
                  Wishlist
                </Link>
              </li>
              <li className={liStyles}>
                <Link href="/orders" className={linkStyles}>
                  My Orders
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className={headingStyles}>Get in Touch</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-gray-400 text-sm">
                <FaPhone className="text-brand-gold flex-shrink-0 text-xs" />
                <a href={`tel:${config.contact.phone.replace(/\s/g, "")}`} className={linkStyles}>
                  {config.contact.phone}
                </a>
              </li>
              <li className="flex items-center gap-2 text-gray-400 text-sm">
                <FaEnvelope className="text-brand-gold flex-shrink-0 text-xs" />
                <a href={`mailto:${config.contact.email}`} className={linkStyles}>
                  {config.contact.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="border-t border-white/10 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm text-center md:text-left">
              © {new Date().getFullYear()} {config.appName}. All rights reserved. | Developed by{" "}
              <a
                href="https://digistrivemedia.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-gold-light hover:text-brand-gold transition-colors"
              >
                Digistrive Media
              </a>
            </p>
            <div className="flex flex-wrap gap-6 text-sm">
              <Link href="/legal/privacy" className={linkStyles}>
                Privacy Policy
              </Link>
              <Link href="/legal/terms" className={linkStyles}>
                Terms & Conditions
              </Link>
              <Link href="/legal/shipping" className={linkStyles}>
                Shipping Policy
              </Link>
              <Link href="/legal/returns" className={linkStyles}>
                Returns & Refund Policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
