import { HeaderSkeleton, StatCardsSkeleton } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <StatCardsSkeleton count={4} />
      <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
    </div>
  );
}
