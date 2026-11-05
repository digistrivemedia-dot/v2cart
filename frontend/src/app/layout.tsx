import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "sonner";

import { LayoutWrapper } from "@/components/layout/LayoutWrapper";
import { Providers } from "@/providers";
import "@/styles/globals.css";
import "@/styles/colors.css";
import "@/styles/animations.css";

export const metadata: Metadata = {
  title: "InveztIN - Infinite Potential. Zero Risk.",
  description: "Buy, sell, and invest — all in one marketplace.",
  keywords: "marketplace, ecommerce, investing, vendors, online shopping",
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};

const isDevelopment = process.env.NODE_ENV === 'development';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
      </head>
      <body className={GeistSans.className}>
        <Providers>
          <LayoutWrapper>
            {children}
            <Toaster position="bottom-right" />
            {!isDevelopment && (
              <>
                <Analytics />
                <SpeedInsights />
              </>
            )}
          </LayoutWrapper>
        </Providers>
      </body>
    </html>
  );
}
