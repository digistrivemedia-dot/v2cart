import { HeaderSkeleton, TableSkeleton } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4">
        <div className="h-12 w-full bg-slate-100 rounded-lg animate-pulse" />
      </div>
      <TableSkeleton rows={8} columns={7} />
    </div>
  );
}
