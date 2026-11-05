"use client";

import { HiCheck, HiClock, HiTruck, HiCheckCircle, HiXCircle } from "react-icons/hi";

interface StatusHistoryItem {
    status: string;
    timestamp: string;
    note?: string;
}

interface OrderStatusTrackerProps {
    currentStatus: string;
    statusHistory?: StatusHistoryItem[];
    createdAt: string;
    deliveredAt?: string;
    shippedAt?: string;
    packedAt?: string;
}

const STATUS_STEPS = [
    { value: "Confirmed", label: "Order Confirmed", icon: HiCheckCircle },
    { value: "Processing", label: "Processing", icon: HiClock },
    { value: "Packed", label: "Packed", icon: HiCheck },
    { value: "Shipped", label: "Shipped", icon: HiTruck },
    { value: "Delivered", label: "Delivered", icon: HiCheckCircle },
];

export default function OrderStatusTracker({
    currentStatus,
    statusHistory = [],
    createdAt,
    deliveredAt,
    shippedAt,
    packedAt,
}: OrderStatusTrackerProps) {
    // If cancelled, show special cancelled view
    if (currentStatus === "Cancelled") {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                        <HiXCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-red-900">Order Cancelled</h3>
                        <p className="text-sm text-red-700">This order has been cancelled</p>
                    </div>
                </div>

                {statusHistory && statusHistory.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-red-200">
                        <p className="text-sm font-medium text-slate-700 mb-2">Status History:</p>
                        <div className="space-y-2">
                            {statusHistory.map((item, index) => (
                                <div key={index} className="text-sm text-slate-600">
                                    <span className="font-medium">{item.status}</span> -{" "}
                                    {new Date(item.timestamp).toLocaleString("en-IN", {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                    {item.note && <p className="text-xs text-slate-500 ml-4">{item.note}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Get current step index
    const currentStepIndex = STATUS_STEPS.findIndex((step) => step.value === currentStatus);
    const statusFlow = ["Pending", "Confirmed", "Processing", "Packed", "Shipped", "Delivered"];
    const currentStatusIndex = statusFlow.indexOf(currentStatus);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Order Tracking</h3>

            {/* Progress Steps */}
            <div className="relative">
                {/* Progress Line */}
                <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-slate-200">
                    <div
                        className="bg-gradient-to-b from-orange-500 to-orange-600 transition-all duration-500"
                        style={{
                            height: `${(currentStepIndex / (STATUS_STEPS.length - 1)) * 100}%`,
                        }}
                    />
                </div>

                {/* Steps */}
                <div className="relative space-y-8">
                    {STATUS_STEPS.map((step, index) => {
                        const Icon = step.icon;
                        const isCompleted = index <= currentStepIndex;
                        const isCurrent = index === currentStepIndex;

                        // Find timestamp for this step
                        let timestamp = "";
                        if (step.value === "Confirmed") timestamp = createdAt;
                        if (step.value === "Packed" && packedAt) timestamp = packedAt;
                        if (step.value === "Shipped" && shippedAt) timestamp = shippedAt;
                        if (step.value === "Delivered" && deliveredAt) timestamp = deliveredAt;

                        return (
                            <div key={step.value} className="flex items-start gap-4">
                                {/* Icon */}
                                <div
                                    className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${isCompleted
                                            ? "bg-orange-500 shadow-lg shadow-orange-500/30"
                                            : "bg-slate-100"
                                        }`}
                                >
                                    <Icon
                                        className={`w-6 h-6 transition-colors ${isCompleted ? "text-white" : "text-slate-400"
                                            }`}
                                    />
                                </div>

                                {/* Content */}
                                <div className="flex-1 pt-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p
                                                className={`font-semibold ${isCompleted ? "text-slate-900" : "text-slate-400"
                                                    }`}
                                            >
                                                {step.label}
                                            </p>
                                            {timestamp && (
                                                <p className="text-sm text-slate-500 mt-1">
                                                    {new Date(timestamp).toLocaleString("en-IN", {
                                                        month: "short",
                                                        day: "numeric",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </p>
                                            )}
                                        </div>
                                        {isCurrent && (
                                            <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
                                                Current
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Status History */}
            {statusHistory && statusHistory.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Status Updates:</p>
                    <div className="space-y-2">
                        {statusHistory.slice().reverse().map((item, index) => (
                            <div
                                key={index}
                                className="flex items-start gap-2 text-sm p-2 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                <div className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-slate-900">{item.status}</span>
                                        <span className="text-xs text-slate-500">
                                            {new Date(item.timestamp).toLocaleString("en-IN", {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </span>
                                    </div>
                                    {item.note && (
                                        <p className="text-xs text-slate-600 mt-1">{item.note}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Estimated Delivery (if not delivered) */}
            {currentStatus !== "Delivered" && currentStatus !== "Cancelled" && (
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2">
                        <HiTruck className="w-5 h-5 text-blue-600" />
                        <div>
                            <p className="text-sm font-medium text-blue-900">
                                {currentStatus === "Shipped"
                                    ? "Out for delivery"
                                    : "Preparing your order"}
                            </p>
                            <p className="text-xs text-blue-700 mt-1">
                                {currentStatus === "Shipped"
                                    ? "Your order will be delivered soon"
                                    : "We'll notify you when your order is shipped"}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
