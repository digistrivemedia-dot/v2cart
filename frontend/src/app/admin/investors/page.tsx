"use client";

import { HiTrendingUp, HiCheck, HiX } from "react-icons/hi";
import { RoleGuard } from "@/components/RoleGuard";
import { useAdminUsers, useApproveUserMutation } from "@/hooks/admin";

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function InvestorsContent() {
  const { users, isLoading } = useAdminUsers();
  const { approve, isPending } = useApproveUserMutation();

  const investors = users.filter((u: any) => u.role === "investor");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Investors</h1>
        <p className="text-slate-600 mt-1">Approve or reject investor onboarding requests</p>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        {investors.length === 0 ? (
          <div className="text-center px-4 py-16 sm:py-20">
            <HiTrendingUp className="w-20 h-20 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No investors yet</h3>
            <p className="text-slate-600">Investor sign-ups will appear here for approval.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-700">Contact</th>
                  <th className="text-left py-4 px-6 text-sm font-semibold text-slate-700">Status</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {investors.map((investor: any) => {
                  const status = investor.investorProfile?.approvalStatus || "pending";
                  return (
                    <tr key={investor._id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-6">
                        <p className="text-slate-900">{investor.name}</p>
                        <p className="text-xs text-slate-500">{investor.email}</p>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[status]}`}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => approve({ userId: investor._id, approvalStatus: "approved" })}
                            disabled={isPending || status === "approved"}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-40"
                          >
                            <HiCheck className="w-4 h-4" /> Approve
                          </button>
                          <button
                            onClick={() => approve({ userId: investor._id, approvalStatus: "rejected" })}
                            disabled={isPending || status === "rejected"}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium disabled:opacity-40"
                          >
                            <HiX className="w-4 h-4" /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminInvestorsPage() {
  return (
    <RoleGuard allow={["admin"]} redirectTo="/admin">
      <InvestorsContent />
    </RoleGuard>
  );
}
