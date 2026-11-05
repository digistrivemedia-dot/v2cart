import { HeaderSkeleton, TableSkeleton } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />
      <TableSkeleton rows={8} columns={4} />
    </div>
  );
}
