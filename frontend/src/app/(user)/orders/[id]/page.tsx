"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { HiArrowLeft, HiOutlineCube } from "react-icons/hi";
import { SVGLoadingIcon } from "@/components/ui/loader";
import OrderStatusTracker from "@/components/orders/OrderStatusTracker";
import { RequestOrderActionModal } from "@/components/orders/RequestOrderActionModal";
import { useRequestOptions } from "@/hooks/order/useOrderRequest";
import { FiAlertCircle, FiClock, FiCheckCircle, FiXCircle } from "react-icons/fi";

interface Order {
  _id: string;
  shippingInfo: {
    address: string;
    city: string;
    state: string;
    country: string;
    pincode: number;
    phoneNo: number;
  };
  orderItems: Array<{
    name: string;
    price: number;
    quantity: number;
    image: string;
    product: string;
  }>;
  user: {
    _id: string;
    name: string;
    email: string;
  };
  paymentInfo: {
    id: string;
    status: string;
  };
  totalPrice: number;
  couponCode?: string;
  discountAmount?: number;
  orderStatus: string;
  statusHistory?: Array<{
    status: string;
    timestamp: string;
    note?: string;
  }>;
  deliveredAt?: string;
  shippedAt?: string;
  packedAt?: string;
  createdAt: string;
  paidAt: string;
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showRequest, setShowRequest] = useState(false);

  // What this customer may ask for, resolved server-side. Also carries any
  // existing request, so the panel shows its status instead of a button.
  const { data: requestOptions, refetch: refetchRequest } = useRequestOptions(orderId);

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      setError(false);

      const token = localStorage.getItem('auth_token');

      if (!token) {
        console.error('No auth token found');
        setError(true);
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1'}/order/${orderId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch order');
      }

      const data = await response.json();

      if (data.success && data.order) {
        setOrder(data.order);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('Error fetching order:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <SVGLoadingIcon height={40} width={40} />
          <p className="mt-4 text-slate-600">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <div className="p-6 rounded-full bg-red-500/10">
          <HiOutlineCube className="w-16 h-16 text-red-500" />
        </div>
        <h2 className="text-3xl font-bold text-slate-900">Order Not Found</h2>
        <p className="text-center text-slate-600 max-w-md">
          The order you're looking for doesn't exist or you don't have access to it.
        </p>
        <Link
          href="/orders"
          className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
        >
          <HiArrowLeft className="w-4 h-4" />
          Back to Orders
        </Link>
      </div>
    );
  }

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
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Link
            href="/orders"
            className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <HiArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
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
          <div className={`px-4 py-2 rounded-xl border-2 font-semibold ${getStatusColor(order.orderStatus)}`}>
            {order.orderStatus}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Order Items & Status Tracker */}
          <div className="lg:col-span-2 space-y-6">
            {/* Phase 22 — the customer's own actions. Which button appears
                (if any) is decided server-side off the delivery state, so this
                never offers something the endpoint would refuse. */}
            {requestOptions && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                {requestOptions.request ? (
                  <RequestStatusPanel request={requestOptions.request} />
                ) : requestOptions.allowedType ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-slate-900">
                        {requestOptions.allowedType === "cancel"
                          ? "Changed your mind?"
                          : "Something wrong with your order?"}
                      </h2>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {requestOptions.allowedType === "cancel"
                          ? "You can ask us to cancel this order while it is still on its way."
                          : "You can ask to return or replace what you received. We'll review it."}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowRequest(true)}
                      className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      {requestOptions.allowedType === "cancel"
                        ? "Cancel order"
                        : "Return or replace"}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{requestOptions.closedReason}</p>
                )}
              </div>
            )}

            {/* Order Status Tracker */}
            <OrderStatusTracker
              currentStatus={order.orderStatus}
              statusHistory={order.statusHistory}
              createdAt={order.createdAt}
              deliveredAt={order.deliveredAt}
              shippedAt={order.shippedAt}
              packedAt={order.packedAt}
            />

            {/* Order Items */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">Order Items</h2>
              <div className="space-y-4">
                {order.orderItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex gap-4 p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                  >
                    <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <HiOutlineCube className="w-8 h-8 text-slate-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900">{item.name}</h3>
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

          {/* Right Column - Order Info */}
          <div className="space-y-6">
            {/* Payment Info */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">Payment Information</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Payment ID</span>
                  <span className="font-mono text-xs text-slate-900 bg-slate-100 px-2 py-1 rounded">
                    {order.paymentInfo.id.slice(0, 20)}...
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Method</span>
                  <span className="font-medium text-slate-900">
                    {order.paymentInfo.status}
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

            {/* Shipping Address */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">Shipping Address</h2>
              <div className="text-sm text-slate-700 leading-relaxed space-y-1">
                <p className="font-semibold text-slate-900">{order.user.name}</p>
                <p>{order.shippingInfo.address}</p>
                <p>{order.shippingInfo.city}, {order.shippingInfo.state}</p>
                <p>{order.shippingInfo.pincode}</p>
                <p className="font-medium">{order.shippingInfo.country}</p>
                <p className="pt-2 border-t border-slate-200 mt-2">
                  Phone: {order.shippingInfo.phoneNo}
                </p>
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">Order Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Items</span>
                  <span className="font-medium text-slate-900">
                    {order.orderItems.length}
                  </span>
                </div>

                {order.couponCode && order.discountAmount && order.discountAmount > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Subtotal</span>
                      <span className="font-medium text-slate-900">
                        ₹{(order.totalPrice + order.discountAmount).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Coupon ({order.couponCode})</span>
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
                      ₹{order.totalPrice.toLocaleString("en-IN", {
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

      {showRequest && requestOptions?.allowedType && (
        <RequestOrderActionModal
          orderId={orderId}
          type={requestOptions.allowedType}
          items={requestOptions.items}
          maxImages={requestOptions.maxImages}
          onClose={() => setShowRequest(false)}
          onDone={() => {
            refetchRequest();
            fetchOrder();
          }}
        />
      )}
    </div>
  );
}

/**
 * An existing request, in place of the buttons.
 *
 * A rejection shows the admin's note — "declined" with no reason is the worst
 * possible version of this feature, and it is also final: the customer cannot
 * re-request, so the copy says so rather than leaving them hunting for a
 * button that no longer exists.
 */
function RequestStatusPanel({ request }: { request: NonNullable<ReturnType<typeof useRequestOptions>["data"]>["request"] }) {
  if (!request) return null;

  const label = request.type === "cancel" ? "Cancellation" : "Return";

  const tone =
    request.status === "pending"
      ? { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900", Icon: FiClock }
      : request.status === "approved"
        ? { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", Icon: FiCheckCircle }
        : { bg: "bg-red-50", border: "border-red-200", text: "text-red-900", Icon: FiXCircle };

  return (
    <div className={`rounded-lg border p-4 ${tone.bg} ${tone.border}`}>
      <div className={`flex items-center gap-2 font-semibold ${tone.text}`}>
        <tone.Icon className="h-4 w-4" />
        {label} request{" "}
        {request.status === "pending"
          ? "under review"
          : request.status === "approved"
            ? "approved"
            : "declined"}
      </div>

      <p className={`mt-1 text-sm ${tone.text}`}>
        {request.status === "pending" &&
          "We've got it and will get back to you shortly. Nothing has changed on your order yet."}
        {request.status === "approved" &&
          (request.mode === "replacement"
            ? "We're sending a replacement."
            : request.type === "cancel"
              ? "Your order has been cancelled and your refund is on its way."
              : "Your refund is on its way.")}
        {request.status === "rejected" && "This request was not approved."}
      </p>

      {request.adminNote && (
        <p className="mt-2 rounded-md bg-white/70 px-3 py-2 text-sm text-slate-700">
          <span className="font-medium">Our reply:</span> {request.adminNote}
        </p>
      )}

      <div className="mt-3 border-t border-black/5 pt-3 text-xs text-slate-600">
        <p>
          <span className="font-medium">You said:</span> {request.reason}
        </p>
        {request.items.length > 0 && (
          <p className="mt-1">
            <span className="font-medium">Items:</span>{" "}
            {request.items.map((i) => i.name).join(", ")}
          </p>
        )}
        {request.images.length > 0 && (
          <div className="mt-2 flex gap-2">
            {request.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.public_id}
                src={img.url}
                alt="Attached photo"
                className="h-14 w-14 rounded-md border border-slate-200 object-cover"
              />
            ))}
          </div>
        )}
      </div>

      {request.status === "rejected" && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-600">
          <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>If you think this is wrong, please contact support — this order cannot be re-submitted.</span>
        </p>
      )}
    </div>
  );
}
