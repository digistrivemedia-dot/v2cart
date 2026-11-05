export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-64 bg-slate-200 rounded animate-pulse mb-2"></div>
          <div className="h-4 w-48 bg-slate-200 rounded animate-pulse"></div>
        </div>
        <div className="h-12 w-40 bg-slate-200 rounded-lg animate-pulse"></div>
      </div>

      {/* Stats Skeleton */}
      <div className="grid md:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-slate-100 rounded-xl p-6 animate-pulse">
            <div className="h-4 w-20 bg-slate-200 rounded mb-2"></div>
            <div className="h-8 w-12 bg-slate-200 rounded"></div>
          </div>
        ))}
      </div>

      {/* Blogs Grid Skeleton */}
      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 overflow-hidden animate-pulse">
              <div className="h-48 bg-slate-200"></div>
              <div className="p-4 space-y-3">
                <div className="h-4 w-3/4 bg-slate-200 rounded"></div>
                <div className="h-3 w-full bg-slate-200 rounded"></div>
                <div className="h-3 w-5/6 bg-slate-200 rounded"></div>
                <div className="flex gap-2 pt-3">
                  <div className="h-10 flex-1 bg-slate-200 rounded"></div>
                  <div className="h-10 flex-1 bg-slate-200 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
