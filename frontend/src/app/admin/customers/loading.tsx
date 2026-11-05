import { HeaderSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <StatCardsSkeleton count={4} />
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
}
