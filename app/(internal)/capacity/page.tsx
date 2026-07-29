import { requireInternal } from "@/lib/permissions";
import { CapacityGrid } from "@/components/capacity/CapacityGrid";

export default async function CapacityPage() {
  await requireInternal();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Capacity</h1>
      </div>
      <CapacityGrid />
    </div>
  );
}
