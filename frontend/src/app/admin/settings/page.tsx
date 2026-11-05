"use client";

import { useMemo, useState } from "react";
import { HiCreditCard, HiPhotograph } from "react-icons/hi";
import { SliderManagement } from "@/components/admin/SliderManagement";
import { useAllPayments, type PaymentRole } from "@/hooks/admin";

type TabType = "payments" | "slider";

const ROLE_FILTERS: { id: PaymentRole | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "customer", label: "Customer" },
  { id: "vendor", label: "Vendor" },
  { id: "investor", label: "Investor" },
];

const ROLE_BADGE: Record<PaymentRole, string> = {
  customer: "bg-blue-100 text-blue-700",
  vendor: "bg-orange-100 text-orange-700",
  investor: "bg-emerald-100 text-emerald-700",
};

function PaymentsPanel() {
  const { payments, isLoading, isError } = useAllPayments();
  const [roleFilter, setRoleFilter] = useState<PaymentRole | "all">("all");

  const filteredPayments = useMemo(
    () => (roleFilter === "all" ? payments : payments.filter((p) => p.role === roleFilter)),
    [payments, roleFilter]
  );

  if (isLoading) {
    return <div className="text-center py-12 text-slate-600">Loading payments...</div>;
  }

  if (isError) {
    return <div className="text-center py-12 text-red-600">Failed to load payments.</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {ROLE_FILTERS.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setRoleFilter(filter.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              roleFilter === filter.id
                ? "bg-orange-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {filteredPayments.length === 0 ? (
        <div className="text-center py-12 text-slate-600">No payments found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="py-2 pr-4 font-medium">Reference</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 whitespace-nowrap text-slate-600">
                    {new Date(payment.date).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_BADGE[payment.role]}`}>
                      {payment.role}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{payment.label}</td>
                  <td className="py-3 pr-4">
                    <div className="text-slate-800">{payment.userName}</div>
                    {payment.userEmail && (
                      <div className="text-xs text-slate-400">{payment.userEmail}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-500">{payment.reference || "—"}</td>
                  <td className="py-3 pr-4 text-slate-500">{payment.status || "—"}</td>
                  <td className="py-3 pr-4 text-right font-semibold text-slate-900">
                    ₹{payment.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("slider");

  const tabs = [
    { id: "slider" as TabType, name: "Hero Slider", icon: HiPhotograph },
    { id: "payments" as TabType, name: "Payments", icon: HiCreditCard },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-600 mt-1">Configure your store settings</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200">
        <div className="border-b border-slate-200">
          <nav className="flex -mb-px overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex shrink-0 items-center gap-2 px-4 sm:px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                      ? "border-orange-500 text-orange-600"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {activeTab === "slider" && <SliderManagement />}
          {activeTab === "payments" && <PaymentsPanel />}
        </div>
      </div>
    </div>
  );
}
