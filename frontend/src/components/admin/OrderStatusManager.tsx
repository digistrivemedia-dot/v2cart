"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { HiCheck, HiX, HiClock, HiTruck, HiCheckCircle, HiXCircle, HiRefresh, HiReply } from "react-icons/hi";

interface StatusHistoryItem {
    status: string;
    timestamp: string;
    updatedBy?: string;
    note?: string;
}

interface OrderStatusManagerProps {
    orderId: string;
    currentStatus: string;
    statusHistory: StatusHistoryItem[];
}

const ORDER_STATUSES = [
    { value: "Pending", label: "Pending", icon: HiClock, color: "gray" },
    { value: "Confirmed", label: "Confirmed", icon: HiCheckCircle, color: "cyan" },
    { value: "Processing", label: "Processing", icon: HiClock, color: "yellow" },
    { value: "Packed", label: "Packed", icon: HiCheck, color: "purple" },
    { value: "Shipped", label: "Shipped", icon: HiTruck, color: "blue" },
    { value: "Delivered", label: "Delivered", icon: HiCheckCircle, color: "green" },
    { value: "Cancelled", label: "Cancelled", icon: HiXCircle, color: "red" },
    // Phase 21 — the two post-delivery outcomes. `Returned` refunds the
    // customer and pays nobody; `Replaced` moves no money at all.
    { value: "Returned", label: "Returned (refund)", icon: HiReply, color: "red" },
    { value: "Replaced", label: "Replaced (swap unit)", icon: HiRefresh, color: "yellow" },
];

export default function OrderStatusManager({
    orderId,
    currentStatus,
    statusHistory,
}: OrderStatusManagerProps) {
    const router = useRouter();
    const [selectedStatus, setSelectedStatus] = useState(currentStatus);
    const [note, setNote] = useState("");
    const [isUpdating, setIsUpdating] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const getAvailableStatuses = () => {
        // A returned order is final: the customer has been refunded and the
        // investor's unit is already back in the pool.
        if (currentStatus === "Cancelled" || currentStatus === "Returned") {
            return [];
        }

        // Phase 21 — delivery is no longer the end of the line. While the
        // return window is open the customer can still send it back or have it
        // swapped, and a swapped order can still be returned afterwards.
        if (currentStatus === "Delivered") {
            return ORDER_STATUSES.filter((s) => ["Returned", "Replaced"].includes(s.value));
        }
        if (currentStatus === "Replaced") {
            return ORDER_STATUSES.filter((s) => s.value === "Returned");
        }

        const statusFlow = ["Pending", "Confirmed", "Processing", "Packed", "Shipped", "Delivered"];
        const currentIndex = statusFlow.indexOf(currentStatus);

        // Can move forward or cancel
        const available = statusFlow.slice(currentIndex + 1);
        available.push("Cancelled");

        return ORDER_STATUSES.filter((s) => available.includes(s.value));
    };

    const handleUpdateStatus = async () => {
        if (selectedStatus === currentStatus) {
            toast.error("Please select a different status");
            return;
        }

        setIsUpdating(true);

        try {
            const token = localStorage.getItem("auth_token");
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1"}/admin/order/${orderId}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    credentials: "include",
                    body: JSON.stringify({
                        status: selectedStatus,
                        note: note || undefined,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Failed to update order status");
            }

            toast.success(data.message || "Order status updated successfully");
            setShowConfirm(false);
            setNote("");
            router.refresh();
        } catch (error) {
            console.error("Error updating order status:", error);
            toast.error(error instanceof Error ? error.message : "Failed to update status");
        } finally {
            setIsUpdating(false);
        }
    };

    const getStatusColor = (status: string) => {
        const statusObj = ORDER_STATUSES.find((s) => s.value === status);
        return statusObj?.color || "gray";
    };

    const getStatusIcon = (status: string) => {
        const statusObj = ORDER_STATUSES.find((s) => s.value === status);
        const Icon = statusObj?.icon || HiClock;
        return Icon;
    };

    const availableStatuses = getAvailableStatuses();

    return (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Order Status Management</h2>

            {/* Status Timeline */}
            <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Status History</h3>
                <div className="space-y-3">
                    {statusHistory && statusHistory.length > 0 ? (
                        statusHistory.map((item, index) => {
                            const Icon = getStatusIcon(item.status);
                            const color = getStatusColor(item.status);

                            return (
                                <div key={index} className="flex gap-3">
                                    <div className={`w-8 h-8 rounded-full bg-${color}-100 flex items-center justify-center flex-shrink-0`}>
                                        <Icon className={`w-4 h-4 text-${color}-600`} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-x-3">
                                            <p className="font-medium text-slate-900">{item.status}</p>
                                            <p className="text-xs text-slate-500">
                                                {new Date(item.timestamp).toLocaleString("en-IN", {
                                                    month: "short",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </p>
                                        </div>
                                        {item.note && (
                                            <p className="text-sm text-slate-600 mt-1">{item.note}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-sm text-slate-500">No status history available</p>
                    )}
                </div>
            </div>

            {/* Update Status Section */}
            {availableStatuses.length > 0 ? (
                <div className="border-t border-slate-200 pt-6">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Update Status</h3>

                    {!showConfirm ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Select New Status
                                </label>
                                <select
                                    value={selectedStatus}
                                    onChange={(e) => setSelectedStatus(e.target.value)}
                                    className="w-full bg-white px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value={currentStatus}>{currentStatus} (Current)</option>
                                    {availableStatuses.map((status) => (
                                        <option key={status.value} value={status.value}>
                                            {status.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Phase 21 — these two move real money (or
                                deliberately don't), so say which before the
                                admin commits rather than in the confirm step. */}
                            {selectedStatus === "Returned" && (
                                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                                    <strong>Refunds the customer</strong> for every line still
                                    inside its return window, and pays nobody: each investor&apos;s
                                    unit goes back in the pool to be sold again, and the vendor is
                                    not paid for it. Lines whose window has closed, or that are not
                                    refundable, are left alone.
                                </div>
                            )}
                            {selectedStatus === "Replaced" && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                    <strong>Moves no money.</strong> The sale stands — the vendor is
                                    still paid and the investor still earns on their original
                                    schedule. One more unit leaves stock, which the vendor absorbs
                                    as the cost of the swap.
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Note {selectedStatus === "Returned" ? "(reason for return)" : "(Optional)"}
                                </label>
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Add a note about this status change..."
                                    rows={3}
                                    className="w-full bg-white px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                                />
                            </div>

                            <button
                                onClick={() => setShowConfirm(true)}
                                disabled={selectedStatus === currentStatus}
                                className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                            >
                                Update Status
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                <p className="text-sm font-medium text-orange-900 mb-2">
                                    Confirm Status Update
                                </p>
                                <p className="text-sm text-orange-700">
                                    Are you sure you want to change the order status from{" "}
                                    <span className="font-semibold">{currentStatus}</span> to{" "}
                                    <span className="font-semibold">{selectedStatus}</span>?
                                </p>
                                {note && (
                                    <p className="text-sm text-orange-700 mt-2">
                                        Note: {note}
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleUpdateStatus}
                                    disabled={isUpdating}
                                    className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors font-medium"
                                >
                                    {isUpdating ? "Updating..." : "Confirm"}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowConfirm(false);
                                        setSelectedStatus(currentStatus);
                                        setNote("");
                                    }}
                                    disabled={isUpdating}
                                    className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 disabled:opacity-50 transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="border-t border-slate-200 pt-6">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                        <p className="text-sm text-slate-600">
                            {currentStatus === "Returned"
                                ? "This order was returned and the customer refunded. No further updates."
                                : "This order has been cancelled. No further status updates allowed."}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
