import { HeaderSkeleton, StatCardsSkeleton } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />
      <StatCardsSkeleton count={4} />
      <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />
    </div>
  );
}
