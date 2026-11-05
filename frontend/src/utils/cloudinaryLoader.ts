type LoaderProps = {
  src: string;
  width: number;
  quality?: number;
};

// Routes image resizing through Cloudinary's own CDN transformations instead of
// Vercel's Image Optimization API, which has a monthly quota and starts returning
// 402 Payment Required once exceeded (the cause of intermittently broken product images).
// Setting a custom loader disables Next's own /_next/image route, so non-Cloudinary
// sources (local assets, other remote domains) are served unresized as-is.
export default function cloudinaryLoader({ src, width, quality }: LoaderProps) {
  if (src.includes("res.cloudinary.com")) {
    const params = [`w_${width}`, `q_${quality ?? "auto"}`, "f_auto", "c_limit"];
    return src.replace("/upload/", `/upload/${params.join(",")}/`);
  }

  return src;
}
