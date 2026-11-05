import { HeaderSkeleton, CardGridSkeleton } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
        <CardGridSkeleton count={6} columns={3} />
      </div>
    </div>
  );
}
