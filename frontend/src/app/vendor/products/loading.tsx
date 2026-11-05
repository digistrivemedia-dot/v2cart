import { HeaderSkeleton, CardGridSkeleton } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <CardGridSkeleton count={6} columns={3} />
    </div>
  );
}
