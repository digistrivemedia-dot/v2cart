/** COMPONENTS */
import Image from "next/image";
/** TYPES */
import type { Product, ProductVariant } from "@/schemas";

interface ProductImageProps {
  image: ProductVariant["images"][number];
  name: Product["name"];
  width: number;
  height: number;
  sizes: string;
  priority?: boolean;
  className?: string;
}

export const ProductImage = ({
  image,
  name,
  width,
  height,
  priority,
  sizes,
  className,
}: ProductImageProps) => {
  const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' viewBox='0 0 800 800'%3E%3Crect fill='%23f3f4f6' width='800' height='800'/%3E%3Ctext fill='%239ca3af' font-family='sans-serif' font-size='60' dy='20.3515625' x='50%25' y='50%25' text-anchor='middle'%3ENo Image%3C/text%3E%3C/svg%3E";
  const imageSrc = (typeof image === 'string' && image ? image : image?.url) || placeholder;

  return (
    <Image
      width={width}
      height={height}
      src={imageSrc}
      alt={name}
      priority={priority}
      className={`w-full h-full object-contain brightness-90 ${className || ''}`}
      sizes={sizes}
    />
  );
};
