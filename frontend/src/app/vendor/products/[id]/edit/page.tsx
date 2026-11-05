"use client";

import { use } from "react";
import Link from "next/link";
import { FiArrowLeft } from "react-icons/fi";
import { useVendorProducts } from "@/hooks/vendor";
import { VendorProductForm } from "@/components/vendor/VendorProductForm";

interface EditVendorProductPageProps {
  params: Promise<{ id: string }>;
}

export default function EditVendorProductPage({ params }: EditVendorProductPageProps) {
  const { id } = use(params);
  const { products, isLoading } = useVendorProducts();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const product = products.find((p: any) => p._id === id);

  if (!product) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          Product not found, or it doesn&apos;t belong to your account.
        </div>
        <Link href="/vendor/products" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
          <FiArrowLeft /> Back to Products
        </Link>
      </div>
    );
  }

  return <VendorProductForm mode="edit" productId={id} initialProduct={product} />;
}
