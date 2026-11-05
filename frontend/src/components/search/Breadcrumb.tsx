import Link from "next/link";
import { FaChevronRight } from "react-icons/fa";

interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export const Breadcrumb = ({ items }: BreadcrumbProps) => {
  return (
    <nav className="flex items-center gap-2 text-sm text-slate-600 mb-6">
      <Link href="/" className="hover:text-orange-500 transition-colors">
        Home
      </Link>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <FaChevronRight className="text-xs text-slate-400" />
          {index === items.length - 1 ? (
            <span className="text-slate-800 font-medium">{item.label}</span>
          ) : (
            <Link href={item.href} className="hover:text-orange-500 transition-colors">
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
};
