"use client";

import { HiClipboardList, HiUser, HiCalendar } from "react-icons/hi";
import { useVendorOrders } from "@/hooks/vendor";

const STATUS_COLOR: Record<string, string> = {
  Pending: "bg-slate-100 text-slate-700",
  Confirmed: "bg-blue-100 text-blue-800",
  Processing: "bg-yellow-100 text-yellow-800",
  Packed: "bg-indigo-100 text-indigo-800",
  Shipped: "bg-purple-100 text-purple-800",
  Delivered: "bg-green-100 text-green-800",
  Cancelled: "bg-red-100 text-red-800",
};

export default function VendorOrdersPage() {
  const { orders, isLoading } = useVendorOrders();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Orders</h1>
        <p className="text-slate-600 mt-1">Orders containing your products (read-only)</p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 text-center px-4 py-16 sm:py-20">
          <HiClipboardList className="w-20 h-20 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 mb-2">No orders yet</h3>
          <p className="text-slate-600">Orders for your products will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order: any) => (
            <div key={order._id} className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="font-mono text-sm text-slate-900">{order._id.slice(-8)}</span>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[order.orderStatus] || "bg-gray-100 text-gray-800"}`}>
                  {order.orderStatus}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 mb-4">
                <div className="flex items-center gap-1.5">
                  <HiUser className="w-4 h-4" /> {order.user?.name || "Guest"}
                </div>
                <div className="flex items-center gap-1.5">
                  <HiCalendar className="w-4 h-4" />
                  {new Date(order.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}
                </div>
              </div>

              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {order.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {item.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image} alt={item.name} className="w-12 h-12 flex-shrink-0 rounded-lg object-cover border border-slate-200" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{item.name}</p>
                        <p className="text-xs text-slate-500">Qty: {item.quantity}</p>
                      </div>
                    </div>
                    <p className="font-semibold text-slate-900 whitespace-nowrap">₹{item.price}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
