import { requireInternal } from "@/lib/permissions";
import { SuppliersManager } from "@/components/suppliers/SuppliersManager";

export default async function SuppliersPage() {
  const session = await requireInternal();
  return <SuppliersManager userRole={session.user.role} />;
}
