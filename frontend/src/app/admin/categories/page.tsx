"use client";

import CategoryManagement from "@/components/admin/settings/CategoryManagement";

// Categories are pure taxonomy. Phases 16/17 hung the margin rules off them and
// gave this page an "Apply margin categories" button, which repriced every
// product whose tier had drifted and could refund investors. Phase 20 moved the
// rules onto the individual product and made them stop touching prices at all,
// so there is nothing to apply and nothing here moves money.
export default function AdminCategoriesPage() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Categories</h1>
                    <p className="text-slate-600 mt-1">Manage your product categories (3 levels: Category → Subcategory → Sub-subcategory)</p>
                </div>
            </div>

            {/* Category Management Component */}
            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 sm:p-6">
                <CategoryManagement />
            </div>
        </div>
    );
}
