import { HeaderSkeleton, TabsSkeleton } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <TabsSkeleton />
    </div>
  );
}
