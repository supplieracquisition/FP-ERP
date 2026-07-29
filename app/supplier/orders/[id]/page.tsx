import { requireSupplier } from "@/lib/permissions";
import { OrderDetail } from "@/components/orders/OrderDetail";

export default async function SupplierOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSupplier();
  const { id } = await params;

  return <OrderDetail orderItemId={id} suppliers={[]} userRole={session.user.role} />;
}
