// Admin-only aggregate stats read via the auth cookie — correctness matters
// more than caching here, so this stays dynamic intentionally.
export const dynamic = 'force-dynamic';
import Link from "next/link";
import {
  HiShoppingBag,
  HiClipboardList,
  HiCurrencyRupee,
  HiUsers,
  HiPlus,
  HiArrowRight,
  HiExclamation,
} from "react-icons/hi";
import { getAdminDashboardStats } from "./actions";

export default async function AdminDashboard() {
  const stats = await getAdminDashboardStats();

  const statCards = [
    {
      title: "Total Products",
      value: stats.totalProducts,
      icon: HiShoppingBag,
      color: "bg-blue-500",
      href: "/admin/products",
      isLowStock: false,
    },
    {
      title: "Low Stock",
      value: stats.lowStockCount,
      icon: HiExclamation,
      color: "bg-amber-500",
      href: null,
      isLowStock: true,
    },
    {
      title: "Total Orders",
      value: stats.totalOrders,
      icon: HiClipboardList,
      color: "bg-green-500",
      href: "/admin/orders",
      isLowStock: false,
    },
    {
      title: "Total Revenue",
      value: `₹${stats.totalRevenue.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      icon: HiCurrencyRupee,
      color: "bg-orange-500",
      href: "/admin/orders",
      isLowStock: false,
    },
    {
      title: "Total Customers",
      value: stats.totalCustomers,
      icon: HiUsers,
      color: "bg-purple-500",
      href: "/admin/customers",
      isLowStock: false,
    },
  ];

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600 mt-1">
            Welcome to InveztIN Admin Panel
          </p>
        </div>
        <Link
          href="/admin/products/create"
          className="flex items-center justify-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors shadow-lg hover:shadow-xl"
        >
          <HiPlus className="w-5 h-5" />
          <span className="font-medium">Add Product</span>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;

          // Low Stock card — non-clickable, amber warning style
          if (stat.isLowStock) {
            return (
              <div
                key={stat.title}
                className="bg-white rounded-xl shadow-md p-6 border-2 border-amber-300 relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-amber-500 rounded-lg flex items-center justify-center">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
                <h3 className="text-sm font-medium text-slate-600 mb-1">{stat.title}</h3>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-amber-500 font-medium mt-1">stock &lt; 10 units</p>
              </div>
            );
          }

          return (
            <Link
              key={stat.title}
              href={stat.href!}
              className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border border-slate-200 hover:border-slate-300 group"
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`w-12 h-12 ${stat.color} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform`}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <HiArrowRight className="w-5 h-5 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-sm font-medium text-slate-600 mb-1">
                {stat.title}
              </h3>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            </Link>
          );
        })}
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Recent Orders</h2>
          <Link
            href="/admin/orders"
            className="text-orange-500 hover:text-orange-600 font-medium text-sm flex items-center gap-1"
          >
            View All
            <HiArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {stats.recentOrders.length === 0 ? (
          <div className="text-center py-12">
            <HiClipboardList className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 text-lg">No orders yet</p>
            <p className="text-slate-400 text-sm mt-1">
              Orders will appear here when customers make purchases
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                    Order ID
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                    Customer
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                    Date
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((order: any) => (
                  <tr
                    key={order._id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-3 px-4 text-sm font-mono text-slate-900">
                      #{order._id.slice(-8).toUpperCase()}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {order.user?.name || "Guest User"}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {new Date(order.createdAt).toLocaleDateString("en-IN", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${order.orderStatus === 'Delivered'
                        ? 'bg-green-100 text-green-800'
                        : order.orderStatus === 'Shipped'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-yellow-100 text-yellow-800'
                        }`}>
                        {order.orderStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-slate-900 text-right">
                      ₹{Number(order.totalPrice || 0).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          href="/admin/products/create"
          className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 border border-slate-200 hover:border-orange-300 group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center group-hover:bg-orange-200 transition-colors">
              <HiPlus className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Add Product</h3>
              <p className="text-sm text-slate-600">Create new product</p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/orders"
          className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 border border-slate-200 hover:border-green-300 group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
              <HiClipboardList className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Manage Orders</h3>
              <p className="text-sm text-slate-600">View and process orders</p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/coupons"
          className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 border border-slate-200 hover:border-blue-300 group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              <HiPlus className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Manage Coupons</h3>
              <p className="text-sm text-slate-600">Create discount coupons</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
