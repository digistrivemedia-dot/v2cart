"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  HiEye,
  HiClipboardList,
  HiCalendar,
  HiUser,
  HiCurrencyRupee,
} from "react-icons/hi";
import { FiChevronLeft, FiChevronRight, FiSearch, FiX } from "react-icons/fi";
import { useAdminOrders } from "@/hooks/order";
import { useOrderRequests } from "@/hooks/order/useOrderRequest";

// Every status an order can hold, in lifecycle order. Includes the Phase 21
// outcomes (Returned / Replaced) — a delivered order is no longer the end of
// the line, so a filter that omitted them would hide real work.
const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Processing",
  "Packed",
  "Shipped",
  "Delivered",
  "Returned",
  "Replaced",
  "Cancelled",
] as const;

// Was keyed on three statuses only, so Confirmed — the status almost every
// live order actually sits in — rendered as anonymous grey.
const STATUS_COLORS: Record<string, string> = {
  Pending: "bg-slate-100 text-slate-700",
  Confirmed: "bg-cyan-100 text-cyan-800",
  Processing: "bg-yellow-100 text-yellow-800",
  Packed: "bg-purple-100 text-purple-800",
  Shipped: "bg-blue-100 text-blue-800",
  Delivered: "bg-green-100 text-green-800",
  Returned: "bg-red-100 text-red-800",
  Replaced: "bg-amber-100 text-amber-800",
  Cancelled: "bg-rose-100 text-rose-800",
};

export default function AdminOrdersPage() {
  const { orders: allOrders, isLoading, isError, error } = useAdminOrders();
  // Phase 22 — which orders have a request waiting. A request that only shows
  // inside one order's detail page is a request nobody finds.
  const { data: requestData } = useOrderRequests("pending");
  const pendingRequestIds = useMemo(
    () => new Set(requestData?.pendingOrderIds ?? []),
    [requestData]
  );

  // Search and Pagination state
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Client-side filtering by search query — derived from the cached order
  // list, so typing a search or changing pages never triggers a refetch.
  const filteredOrders = useMemo(() => {
    // Status first, so the count shown next to each option below stays honest
    // about what the search is being applied to.
    const byStatus = statusFilter === "all"
      ? allOrders
      : statusFilter === "__requests"
        // Not a real order status — orders awaiting a decision, which is the
        // one thing admin needs to find fastest.
        ? allOrders.filter((order: any) => pendingRequestIds.has(String(order._id)))
        : allOrders.filter((order: any) => order.orderStatus === statusFilter);

    if (!searchQuery) return byStatus;

    const searchLower = searchQuery.toLowerCase();

    return byStatus.filter((order: any) => {
      try {
        if (order._id?.toLowerCase().includes(searchLower)) return true;
        if (order.user?.name?.toLowerCase().includes(searchLower)) return true;
        if (order.user?.email?.toLowerCase().includes(searchLower)) return true;
        if (order.shippingInfo?.phoneNo?.includes(searchQuery)) return true;
        if (order.orderStatus?.toLowerCase().includes(searchLower)) return true;
        // Searchable by what was actually ordered, which is how admin thinks
        // about an order they are being asked about.
        if (order.orderItems?.some((i: any) => i.name?.toLowerCase().includes(searchLower))) return true;

        if (order.createdAt) {
          const orderDate = new Date(order.createdAt);
          const dateStr = orderDate.toLocaleDateString('en-IN');
          const isoDateStr = orderDate.toISOString().split('T')[0];
          const readableDateStr = orderDate.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });

          if (dateStr.includes(searchQuery) ||
              isoDateStr.includes(searchQuery) ||
              readableDateStr.toLowerCase().includes(searchLower)) {
            return true;
          }
        }

        return false;
      } catch (filterError) {
        console.error('Error filtering order:', order._id, filterError);
        return false;
      }
    });
  }, [allOrders, searchQuery, statusFilter, pendingRequestIds]);

  // Per-status totals for the filter labels, counted off the unfiltered list
  // so they do not change as you filter.
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const order of allOrders) {
      counts[order.orderStatus] = (counts[order.orderStatus] || 0) + 1;
    }
    return counts;
  }, [allOrders]);

  const totalOrders = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalOrders / itemsPerPage));

  const orders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  // Search handlers
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
    setCurrentPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setCurrentPage(1);
  };

  // Pagination handlers
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  // Generate page numbers
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const itemsPerPageOptions = [6, 12, 18, 24, 30];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Orders Management</h1>
          <p className="text-slate-600 mt-1">
            View and manage all customer orders
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-200">
          <HiClipboardList className="w-5 h-5 text-slate-600" />
          <span className="font-semibold text-slate-900">{totalOrders}</span>
          <span className="text-slate-600 text-sm">Total Orders</span>
        </div>
      </div>

      {/* Search Box */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4">
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by order ID, customer name, phone, date, or status..."
              className="w-full pl-12 pr-24 py-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="mr-3 absolute right-20 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition-colors"
                title="Clear search"
              >
                <FiX className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors text-sm font-medium"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Status filter — the quickest way to find "what do I need to mark
          delivered today". Client-side off the cached list, like the search. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-600">Status:</span>
        <button
          onClick={() => { setStatusFilter("all"); setCurrentPage(1); }}
          className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            statusFilter === "all"
              ? "border-orange-500 bg-orange-500 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          All ({allOrders.length})
        </button>
        {/* Requests first: it is the only chip that represents work waiting
            on the admin rather than a state the order is simply in. */}
        {(requestData?.pendingCount ?? 0) > 0 && (
          <button
            onClick={() => { setStatusFilter("__requests"); setCurrentPage(1); }}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
              statusFilter === "__requests"
                ? "border-amber-600 bg-amber-600 text-white"
                : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
            }`}
          >
            Requests ({requestData?.pendingCount})
          </button>
        )}
        {ORDER_STATUSES.map((status) => {
          const count = statusCounts[status] || 0;
          // Statuses nothing has ever reached are hidden rather than shown as
          // dead zeroes — with nine of them the row is otherwise mostly noise.
          if (count === 0 && statusFilter !== status) return null;
          return (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); setCurrentPage(1); }}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === status
                  ? "border-orange-500 bg-orange-500 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {status} ({count})
            </button>
          );
        })}
      </div>

      {/* Items Per Page Selector */}
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="text-sm text-slate-600 font-medium whitespace-nowrap">Show:</span>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          {itemsPerPageOptions.map((option) => (
            <button
              key={option}
              onClick={() => handleItemsPerPageChange(option)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                itemsPerPage === option
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-600 whitespace-nowrap">per page</span>
      </div>

      {/* Error Message */}
      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error instanceof Error ? error.message : 'Failed to load orders'}
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200">
        {orders.length === 0 ? (
          <div className="text-center px-4 py-16 sm:py-20">
            <HiClipboardList className="w-20 h-20 text-slate-300 mx-auto mb-4" />
            {/* "No Orders Yet" was shown for an empty FILTER too, which reads
                as though the shop had never sold anything. */}
            {allOrders.length === 0 ? (
              <>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  No Orders Yet
                </h3>
                <p className="text-slate-600">
                  Customer orders will appear here when they make purchases
                </p>
              </>
            ) : (
              <>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  No matching orders
                </h3>
                <p className="text-slate-600">
                  {statusFilter !== "all" && searchQuery
                    ? `No ${statusFilter} orders match "${searchQuery}".`
                    : statusFilter === "__requests"
                      ? "No orders have a request waiting."
                      : statusFilter !== "all"
                        ? `No orders are currently ${statusFilter}.`
                      : `Nothing matches "${searchQuery}".`}
                </p>
                <button
                  onClick={() => {
                    setStatusFilter("all");
                    handleClearSearch();
                  }}
                  className="mt-4 cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-700">
                    Order ID
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-700">
                    Customer
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-700">
                    Order Date
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-700">
                    Status
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-700">
                    Products
                  </th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-slate-700">
                    Amount
                  </th>
                  <th className="text-center py-4 px-6 text-sm font-semibold text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order: any) => {
                  return (
                    <tr
                      key={order._id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              pendingRequestIds.has(String(order._id))
                                ? "bg-amber-500"
                                : "bg-green-500"
                            }`}
                          ></div>
                          <span className="font-mono text-sm text-slate-900">
                            {order._id.slice(-8)}
                          </span>
                        </div>
                        {pendingRequestIds.has(String(order._id)) && (
                          <span className="mt-1 ml-4 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            request waiting
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <HiUser className="w-4 h-4 text-slate-400" />
                            <span className="text-slate-900">
                              {order.user?.name || "Guest User"}
                            </span>
                          </div>
                          {order.shippingInfo?.phoneNo && (
                            <span className="text-xs text-slate-500 ml-6">
                              {order.shippingInfo.phoneNo}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <HiCalendar className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-600 text-sm">
                            {new Date(order.createdAt).toLocaleDateString("en-IN", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.orderStatus] || 'bg-gray-100 text-gray-800'}`}>
                          {order.orderStatus}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        {/* The names, not just a count. A row reading
                            "3 items" is unidentifiable, which is the whole
                            reason this column existed. */}
                        {order.orderItems?.length ? (
                          <div className="flex flex-col gap-0.5 max-w-[260px]">
                            {order.orderItems.slice(0, 2).map((item: any, i: number) => (
                              <span
                                key={`${order._id}-${i}`}
                                className="truncate text-sm text-slate-900"
                                title={item.name}
                              >
                                {item.name}
                                {item.quantity > 1 && (
                                  <span className="text-slate-500"> ×{item.quantity}</span>
                                )}
                              </span>
                            ))}
                            {order.orderItems.length > 2 && (
                              <span className="text-xs text-slate-500">
                                +{order.orderItems.length - 2} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <HiCurrencyRupee className="w-4 h-4 text-slate-600" />
                          <span className="font-semibold text-slate-900">
                            {Number(order.totalPrice || 0).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <Link
                          href={`/admin/orders/${order._id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
                        >
                          <HiEye className="w-4 h-4" />
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalOrders > 0 && totalPages > 1 && (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
          {/* Page Navigation */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {/* Previous Button */}
            <button
              onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            >
              <FiChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>

            {/* Page Numbers */}
            <div className="flex flex-wrap items-center justify-center gap-1">
              {getPageNumbers().map((page, index) => (
                page === '...' ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-slate-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page as number)}
                    className={`min-w-[40px] h-10 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                      currentPage === page
                        ? "bg-orange-500 text-white shadow-sm"
                        : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {page}
                  </button>
                )
              ))}
            </div>

            {/* Next Button */}
            <button
              onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
            >
              <span className="hidden sm:inline">Next</span>
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Page Info */}
          <div className="text-center text-sm text-slate-500 mt-4">
            Page {currentPage} of {totalPages}
          </div>
        </div>
      )}
    </div>
  );
}
