import { HeaderSkeleton, CardGridSkeleton } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <CardGridSkeleton count={8} columns={4} />
    </div>
  );
}
