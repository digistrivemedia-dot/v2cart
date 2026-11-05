import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    loader: "custom",
    loaderFile: "./src/utils/cloudinaryLoader.ts",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "via.placeholder.com",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "assets-news.housing.com",
      },
      {
        protocol: "https",
        hostname: "**.unsplash.com",
      },
    ],
    formats: ['image/webp'],
    // Cache optimized images for 24 hours — reduces repeated transformations on Vercel
    minimumCacheTTL: 86400,
    // Limit device sizes to reduce the number of unique image variants generated
    deviceSizes: [640, 750, 1080, 1920],
    imageSizes: [64, 128, 256, 384],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb', // Allow up to 25MB for slider videos/images
    },
  },
  reactStrictMode: true,
};

export default nextConfig;
