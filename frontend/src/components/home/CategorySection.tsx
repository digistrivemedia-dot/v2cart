"use server";

import Link from "next/link";
import Image from "next/image";
import { FaEllipsisH } from "react-icons/fa";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1";

// Map category name keywords → public image filename
const IMAGE_MAP: Record<string, string> = {
  mobile:     "/Icon -Smartphones in Blue Circle.png",
  phone:      "/Icon -Smartphones in Blue Circle.png",
  fashion:    "/Icon - Pastel Fashion circle.png",
  cloth:      "/Icon - Pastel Fashion circle.png",
  apparel:    "/Icon - Pastel Fashion circle.png",
  home:       "/Icon - Home Essentials.png",
  appliance:  "/Icon - Modern Home Appliance Collection.png",
  kitchen:    "/Icon - Modern Home Appliance Collection.png",
  beauty:     "/Icon -Cosmetics and Flower on Peach Circle.png",
  cosmetic:   "/Icon -Cosmetics and Flower on Peach Circle.png",
  health:     "/Icon -Cosmetics and Flower on Peach Circle.png",
  grocery:    "/Icon - Fresh Market Basket Essentials.png",
  food:       "/Icon - Fresh Market Basket Essentials.png",
  furniture:  "/Icon - Modern Living Room Furniture Icon.png",
  toy:        "/Icon - Colorful Toy Circle Collection.png",
  game:       "/Icon - Colorful Toy Circle Collection.png",
};

function getIcon(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, src] of Object.entries(IMAGE_MAP)) {
    if (lower.includes(key)) return src;
  }
  return null;
}

// Static fallback list with pre-mapped icons
const STATIC_ITEMS = [
  { name: "Mobiles",    href: "/search?category=mobiles",    icon: "/Icon -Smartphones in Blue Circle.png" },
  { name: "Fashion",    href: "/search?category=fashion",    icon: "/Icon - Pastel Fashion circle.png" },
  { name: "Home",       href: "/search?category=home",       icon: "/Icon - Home Essentials.png" },
  { name: "Appliances", href: "/search?category=appliances", icon: "/Icon - Modern Home Appliance Collection.png" },
  { name: "Beauty",     href: "/search?category=beauty",     icon: "/Icon -Cosmetics and Flower on Peach Circle.png" },
  { name: "Grocery",    href: "/search?category=grocery",    icon: "/Icon - Fresh Market Basket Essentials.png" },
  { name: "Furniture",  href: "/search?category=furniture",  icon: "/Icon - Modern Living Room Furniture Icon.png" },
  { name: "Toys",       href: "/search?category=toys",       icon: "/Icon - Colorful Toy Circle Collection.png" },
];

async function fetchTopCategories() {
  try {
    const res = await fetch(`${API_BASE_URL}/categories`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    const cats = data.categories || data || [];
    return cats.filter((c: any) => !c.parent).slice(0, 8);
  } catch {
    return [];
  }
}

export const CategorySection = async () => {
  const categories = await fetchTopCategories();

  const displayItems =
    categories.length > 0
      ? categories.map((c: any) => ({
          name: c.name,
          href: `/search?category=${c.slug}`,
          icon: getIcon(c.name),
        }))
      : STATIC_ITEMS;

  return (
    <section className="bg-white py-4 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 sm:gap-4">
          {displayItems.map((item: any) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden group-hover:scale-110 transition-transform duration-200">
                {item.icon ? (
                  <Image
                    src={item.icon}
                    alt={item.name}
                    width={64}
                    height={64}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center rounded-full">
                    <FaEllipsisH className="text-gray-400 text-xl" />
                  </div>
                )}
              </div>
              <span className="text-[10px] sm:text-xs text-slate-700 font-medium text-center leading-tight">
                {item.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};
