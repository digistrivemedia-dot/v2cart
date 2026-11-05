import { notFound } from "next/navigation";
import Link from "next/link";
import { HiArrowLeft, HiUser, HiMail, HiPhone, HiLocationMarker, HiCurrencyRupee, HiCalendar, HiTag } from "react-icons/hi";
import { getOrderDetails } from "./actions";
import OrderStatusManager from "@/components/admin/OrderStatusManager";
import { OrderRequestPanel } from "@/components/admin/OrderRequestPanel";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrderDetails(id);

  if (!order) {
    notFound();
  }

  // Helper function to get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Delivered':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Shipped':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Packed':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Processing':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Confirmed':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'Cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Pending':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/orders"
            className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <HiArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Order #{order._id.slice(-8).toUpperCase()}
            </h1>
            <p className="text-slate-600 mt-1">
              Placed on {new Date(order.createdAt).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        {/* Current Status Badge */}
        <div className={`self-start px-4 py-2 rounded-xl border-2 font-semibold ${getStatusColor(order.orderStatus)}`}>
          {order.orderStatus}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Order Items & Status Manager */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Status Manager */}
          {/* Phase 22 — the customer's request, above the manual control,
              because deciding it IS the status change. Renders nothing when
              there is no request on this order. */}
          <OrderRequestPanel orderId={order._id} />
          <OrderStatusManager orderId={order._id} currentStatus={order.orderStatus} statusHistory={order.statusHistory || []} />

          {/* Order Items */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Order Items</h2>
            <div className="space-y-4">
              {order.orderItems?.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="flex flex-wrap gap-4 p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                >
                  <div className="relative w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        No Image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900 break-words">
                      {item.name || "Product Name"}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Quantity: <span className="font-medium">{item.quantity}</span>
                    </p>
                    <p className="text-sm text-slate-600">
                      Price: <span className="font-medium">₹{item.price.toLocaleString("en-IN")}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">
                      ₹{(item.price * item.quantity).toLocaleString("en-IN")}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Subtotal</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Customer & Order Info */}
        <div className="space-y-6">
          {/* Payment Info */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Payment Information</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Payment ID</span>
                <span className="font-mono text-xs text-slate-900 bg-slate-100 px-2 py-1 rounded break-all">
                  {order.paymentInfo?.id?.slice(0, 20)}...
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Method</span>
                <span className="font-medium text-slate-900">
                  {order.paymentInfo?.status || "Cash on Delivery"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Paid At</span>
                <span className="font-medium text-slate-900">
                  {new Date(order.paidAt).toLocaleDateString("en-IN")}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Customer Information</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <HiUser className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-600">Name</p>
                  <p className="font-medium text-slate-900">
                    {order.user?.name || "Guest User"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <HiMail className="w-5 h-5 flex-shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="text-sm text-slate-600">Email</p>
                  <p className="font-medium text-slate-900 break-all">
                    {order.user?.email || "N/A"}
                  </p>
                </div>
              </div>
              {order.shippingInfo?.phoneNo && (
                <div className="flex items-center gap-3">
                  <HiPhone className="w-5 h-5 text-slate-400" />
                  <div>
                    <p className="text-sm text-slate-600">Phone</p>
                    <p className="font-medium text-slate-900">
                      {order.shippingInfo.phoneNo}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Shipping Address */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Shipping Address</h2>
            {order.shippingInfo && (
              <div className="flex gap-3">
                <HiLocationMarker className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" />
                <div className="text-sm text-slate-700 leading-relaxed">
                  <p>{order.shippingInfo.address}</p>
                  <p>{order.shippingInfo.city}, {order.shippingInfo.state}</p>
                  <p>{order.shippingInfo.pincode}</p>
                  <p className="font-medium">{order.shippingInfo.country}</p>
                </div>
              </div>
            )}
          </div>

          {/* Order Summary */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Order Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Items</span>
                <span className="font-medium text-slate-900">
                  {order.orderItems?.length || 0}
                </span>
              </div>

              {order.couponCode && order.discountAmount && order.discountAmount > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="font-medium text-slate-900">
                      ₹{(order.totalPrice + order.discountAmount).toLocaleString("en-IN", {
                        minimumFractionDigits: 2
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-green-600">
                    <div className="flex items-center gap-1">
                      <HiTag className="w-4 h-4" />
                      <span>Coupon ({order.couponCode})</span>
                    </div>
                    <span className="font-medium">
                      -₹{order.discountAmount.toFixed(2)}
                    </span>
                  </div>
                </>
              )}

              <div className="border-t border-slate-200 pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-900">Total Amount</span>
                  <span className="text-xl font-bold text-orange-500">
                    ₹{Number(order.totalPrice || 0).toLocaleString("en-IN", {
                      minimumFractionDigits: 2
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
