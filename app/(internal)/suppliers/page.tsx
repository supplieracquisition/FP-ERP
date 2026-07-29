import { requireInternal } from "@/lib/permissions";
import { SuppliersManager } from "@/components/suppliers/SuppliersManager";

export default async function SuppliersPage() {
  await requireInternal();
  return <SuppliersManager />;
}
