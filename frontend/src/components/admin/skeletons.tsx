/**
 * Reusable loading-skeleton building blocks for the admin/vendor/investor
 * dashboards, following the shape of the existing admin/blogs/loading.tsx
 * (real layout skeletons, not a generic spinner). Compose these in each
 * route's loading.tsx instead of hand-rolling pulse divs per page.
 */

export function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="h-8 w-48 sm:w-64 bg-slate-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-40 sm:w-48 bg-slate-200 rounded animate-pulse" />
      </div>
      <div className="h-12 w-full sm:w-40 bg-slate-200 rounded-lg animate-pulse" />
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-slate-100 rounded-xl p-4 sm:p-6 animate-pulse">
          <div className="h-4 w-20 bg-slate-200 rounded mb-2" />
          <div className="h-8 w-12 bg-slate-200 rounded" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 sm:px-6 py-4">
        <div className="h-4 w-full max-w-md bg-slate-200 rounded animate-pulse" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 sm:px-6 py-4 animate-pulse">
            {Array.from({ length: columns }).map((_, j) => (
              <div key={j} className="h-4 flex-1 bg-slate-200 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 6, columns = 3 }: { count?: number; columns?: number }) {
  const colClass = columns === 2 ? "md:grid-cols-2" : columns === 4 ? "md:grid-cols-4" : "md:grid-cols-3";
  return (
    <div className={`grid grid-cols-1 ${colClass} gap-4 sm:gap-6`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg border border-slate-200 overflow-hidden animate-pulse">
          <div className="h-40 bg-slate-200" />
          <div className="p-4 space-y-3">
            <div className="h-4 w-3/4 bg-slate-200 rounded" />
            <div className="h-3 w-full bg-slate-200 rounded" />
            <div className="h-3 w-5/6 bg-slate-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TreeSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse" style={{ paddingLeft: `${(i % 3) * 24}px` }}>
          <div className="h-4 w-4 bg-slate-200 rounded" />
          <div className="h-4 flex-1 max-w-xs bg-slate-200 rounded" />
        </div>
      ))}
    </div>
  );
}

export function TabsSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200">
      <div className="border-b border-slate-200 flex gap-4 sm:gap-6 px-4 sm:px-6 py-4 overflow-x-auto">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-20 bg-slate-200 rounded animate-pulse" />
        ))}
      </div>
      <div className="p-4 sm:p-6">
        <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
