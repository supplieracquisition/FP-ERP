import { requireInternal } from "@/lib/permissions";
import { OrderDetail } from "@/components/orders/OrderDetail";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireInternal();
  const { id } = await params;

  // The supplier list this used to fetch fed one control: a dropdown that
  // assigned the order by PATCHing supplierId. That control is gone —
  // assignment runs through the PO Builder, which holds the processor claim —
  // so the query went with it.
  return <OrderDetail orderItemId={id} userRole={session.user.role} />;
}
