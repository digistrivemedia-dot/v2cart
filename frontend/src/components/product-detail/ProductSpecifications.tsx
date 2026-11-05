import type { ProductWithVariants } from "@/schemas";

interface ProductSpecificationsProps {
  product: ProductWithVariants;
}

export const ProductSpecifications = ({ product }: ProductSpecificationsProps) => {
  // Get specifications from product database
  const specifications = product.specifications || [];

  if (specifications.length === 0) {
    return null; // Don't show section if no specifications
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-slate-800 mb-6">Product Specifications</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        {specifications.map((spec: any, index: number) => (
          <div key={index} className="grid grid-cols-[auto_1fr] gap-x-4 py-2 border-b border-gray-100">
            <span className="text-slate-600 font-medium whitespace-nowrap">{spec.title}:</span>
            <span className="text-slate-800 font-semibold text-right">{spec.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
