import { HeaderSkeleton, TreeSkeleton } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
        <TreeSkeleton rows={8} />
      </div>
    </div>
  );
}
