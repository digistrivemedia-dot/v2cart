"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HiOutlineCube, HiCheckCircle } from "react-icons/hi";
import { SVGLoadingIcon } from "@/components/ui/loader";
import { getApiUrl } from "@/lib/utils/api";

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
    paymentInfo: {
        id: string;
        status: string;
    };
    totalPrice: number;
    couponCode?: string;
    discountAmount?: number;
    orderStatus: string;
    deliveredAt?: string;
    shippedAt?: string;
    createdAt: string;
}

export const OrdersList = () => {
    const [orders, setOrders] = useState<Order[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        let timeoutId: NodeJS.Timeout | null = null;

        // Check if redirected from successful order
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'true') {
            setShowSuccess(true);
            // Remove the success param from URL
            window.history.replaceState({}, '', '/orders');
            // Hide success message after 5 seconds
            timeoutId = setTimeout(() => setShowSuccess(false), 5000);
        }

        fetchOrders();

        // Cleanup function
        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, []);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            setError(false);

            const token = localStorage.getItem('auth_token');

            console.log('🔍 Fetching orders from:', `${getApiUrl()}/orders/me`);

            const response = await fetch(`${getApiUrl()}/orders/me`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                credentials: 'include',
            });

            console.log('📡 Response status:', response.status);

            if (!response.ok) {
                throw new Error('Failed to fetch orders');
            }

            const data = await response.json();

            console.log('📦 Full API Response:', data);
            console.log('📦 Orders count:', data.orders?.length || 0);

            if (data.orders && data.orders.length > 0) {
                console.log('📦 First order details:', {
                    id: data.orders[0]._id,
                    items: data.orders[0].orderItems,
                    total: data.orders[0].totalPrice,
                    status: data.orders[0].orderStatus
                });
            }

            if (data.success && data.orders) {
                setOrders(data.orders);
            } else {
                setOrders([]);
            }
        } catch (err) {
            console.error('❌ Error fetching orders:', err);
            setError(true);
            setOrders(null);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <SVGLoadingIcon height={40} width={40} />
                    <p className="mt-4 text-slate-600">Loading your orders...</p>
                </div>
            </div>
        );
    }

    if (error || orders === null) {
        return (
            <div className="flex flex-col items-center justify-center w-full min-h-[60vh] gap-4 px-4">
                <div className="p-6 rounded-full bg-red-500/10">
                    <HiOutlineCube className="w-16 h-16 text-red-500" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900">Error Loading Orders</h2>
                <p className="text-center text-slate-600 max-w-md">
                    There was a problem loading your orders. Please try again.
                </p>
                <div className="flex gap-4">
                    <Link
                        href="/"
                        className="px-6 py-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
                    >
                        Go Home
                    </Link>
                    <button
                        onClick={fetchOrders}
                        className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center w-full min-h-[60vh] gap-4 px-4">
                <div className="p-6 rounded-full bg-slate-100">
                    <HiOutlineCube className="w-16 h-16 text-slate-400" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900">No Orders Yet</h2>
                <p className="text-center text-slate-600 max-w-md">
                    Start shopping and your orders will appear here. We'll keep track of
                    everything for you!
                </p>
                <Link
                    href="/"
                    className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
                >
                    Start Shopping
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                {/* Success Message */}
                {showSuccess && (
                    <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                        <HiCheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                        <div>
                            <p className="font-semibold text-green-900">Order Placed Successfully!</p>
                            <p className="text-sm text-green-700">Thank you for your order. We'll send you updates via email.</p>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">My Orders</h1>
                    <p className="text-slate-600">
                        View and track all your orders ({orders.length} {orders.length === 1 ? 'order' : 'orders'})
                    </p>
                </div>

                {/* Orders Grid */}
                <div className="grid gap-6">
                    {orders.map((order) => {
                        console.log('🎨 Rendering order:', order._id, 'with items:', order.orderItems);

                        return (
                            <div
                                key={order._id}
                                className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
                            >
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 pb-4 border-b border-slate-200">
                                    <div>
                                        <p className="text-sm text-slate-500">Order ID</p>
                                        <p className="font-mono text-sm font-semibold text-slate-900">
                                            #{order._id.slice(-8).toUpperCase()}
                                        </p>
                                    </div>
                                    <div className="mt-2 md:mt-0">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border-2 ${order.orderStatus === 'Delivered'
                                                ? 'bg-green-100 text-green-800 border-green-200'
                                                : order.orderStatus === 'Shipped'
                                                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                                                    : order.orderStatus === 'Packed'
                                                        ? 'bg-purple-100 text-purple-800 border-purple-200'
                                                        : order.orderStatus === 'Processing'
                                                            ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                                                            : order.orderStatus === 'Confirmed'
                                                                ? 'bg-cyan-100 text-cyan-800 border-cyan-200'
                                                                : order.orderStatus === 'Cancelled'
                                                                    ? 'bg-red-100 text-red-800 border-red-200'
                                                                    : 'bg-gray-100 text-gray-800 border-gray-200'
                                            }`}>
                                            {order.orderStatus}
                                        </span>
                                    </div>
                                </div>

                                {/* Order Items */}
                                <div className="space-y-3 mb-4">
                                    {order.orderItems && order.orderItems.length > 0 ? (
                                        order.orderItems.map((item, idx) => (
                                            <div key={idx} className="flex gap-4">
                                                <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                                                    {item.image ? (
                                                        <img
                                                            src={item.image}
                                                            alt={item.name || 'Product'}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => {
                                                                console.log('❌ Image failed to load:', item.image);
                                                                e.currentTarget.style.display = 'none';
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <HiOutlineCube className="w-8 h-8 text-slate-300" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-slate-900 truncate">
                                                        {item.name || 'Product Name Not Available'}
                                                    </p>
                                                    <p className="text-sm text-slate-600">
                                                        Qty: {item.quantity || 0} × ₹{(item.price || 0).toLocaleString('en-IN')}
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-500 text-sm">No items in this order</p>
                                    )}
                                </div>

                                {/* Total and Actions */}
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between pt-4 border-t border-slate-200">
                                    <div>
                                        <p className="text-sm text-slate-500">Total Amount</p>
                                        <p className="text-2xl font-bold text-orange-600">
                                            ₹{(order.totalPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </p>
                                        {order.couponCode && order.discountAmount && order.discountAmount > 0 && (
                                            <p className="text-xs text-green-600 mt-1">
                                                Coupon "{order.couponCode}" applied • Saved ₹{order.discountAmount.toFixed(2)}
                                            </p>
                                        )}
                                    </div>
                                    <div className="mt-4 md:mt-0 flex gap-2">
                                        <Link
                                            href={`/orders/${order._id}`}
                                            className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
                                        >
                                            View Details
                                        </Link>
                                    </div>
                                </div>

                                {/* Order Date */}
                                <div className="mt-4 pt-4 border-t border-slate-200 text-xs text-slate-500">
                                    Ordered on {new Date(order.createdAt).toLocaleDateString('en-IN', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
