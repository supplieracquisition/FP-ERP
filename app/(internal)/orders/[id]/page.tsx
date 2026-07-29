import { requireInternal } from "@/lib/permissions";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { OrderDetail } from "@/components/orders/OrderDetail";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireInternal();
  const { id } = await params;

  const allSuppliers = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
    })
    .from(suppliers)
    .where(eq(suppliers.active, true))
    .orderBy(asc(suppliers.name));

  return <OrderDetail orderItemId={id} suppliers={allSuppliers} userRole={session.user.role} />;
}
