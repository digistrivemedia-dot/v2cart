"use client";

import Link from "next/link";
import { HiPlus, HiPencil, HiTrash, HiShoppingBag } from "react-icons/hi";
import { toast } from "sonner";
import { useVendorProducts, useVendorProductMutation } from "@/hooks/vendor";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  live: "Live",
  rejected: "Rejected",
  paused: "Paused",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-800",
  live: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  paused: "bg-slate-200 text-slate-700",
};

export default function VendorProductsPage() {
  const { products, isLoading } = useVendorProducts();
  const { removeAsync, isRemoving } = useVendorProductMutation();

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await removeAsync(id);
    } catch {
      // toast already shown by the mutation's onError
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Your Products</h1>
          <p className="text-slate-600 mt-1">Manage your product listings</p>
        </div>
        <Link
          href="/vendor/products/create"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors font-medium"
        >
          <HiPlus className="w-5 h-5" /> Add Product
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 text-center px-4 py-16 sm:py-20">
          <HiShoppingBag className="w-20 h-20 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 mb-2">No products yet</h3>
          <p className="text-slate-600 mb-6">Add your first product to get started.</p>
          <Link
            href="/vendor/products/create"
            className="inline-flex items-center gap-2 px-5 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors font-medium"
          >
            <HiPlus className="w-5 h-5" /> Add Product
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product: any) => {
            const image = product.images?.find((img: any) => img.isFeatured) || product.images?.[0];
            return (
              <div key={product._id} className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                <div className="relative h-44 bg-slate-100">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- matches admin/products/page.tsx's Cloudinary image convention
                    <img src={image.url} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <HiShoppingBag className="w-10 h-10" />
                    </div>
                  )}
                  <span className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[product.listingStatus] || STATUS_COLOR.draft}`}>
                    {STATUS_LABEL[product.listingStatus] || "Draft"}
                  </span>
                </div>
                <div className="p-4 space-y-2">
                  <h3 className="font-semibold text-slate-900 truncate">{product.name}</h3>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Listed at</span>
                    <span className="font-semibold text-slate-900">₹{product.price ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">You receive</span>
                    <span className="font-semibold text-slate-900">₹{product.vendorPrice ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Stock</span>
                    <span className="font-semibold text-slate-900">{product.stock}</span>
                  </div>
                  {product.listingStatus === "rejected" && product.rejectionNote && (
                    <div className="mt-1 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs font-medium text-red-700 mb-0.5">Rejection reason</p>
                      <p className="text-xs text-red-600">{product.rejectionNote}</p>
                    </div>
                  )}
                  <div className="flex gap-2 pt-3">
                    <Link
                      href={`/vendor/products/${product._id}/edit`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                    >
                      <HiPencil className="w-4 h-4" /> Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(product._id, product.name)}
                      disabled={isRemoving}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      <HiTrash className="w-4 h-4" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
