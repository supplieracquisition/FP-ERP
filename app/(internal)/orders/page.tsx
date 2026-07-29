import { requireInternal } from "@/lib/permissions";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { KanbanBoard } from "@/components/orders/KanbanBoard";
import { Suspense } from "react";
import ViewToggle from "./ViewToggle";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireInternal();
  const { view } = await searchParams;
  const isKanban = view === "kanban";

  const allSuppliers = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.active, true));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Orders</h1>
        <ViewToggle current={isKanban ? "kanban" : "table"} />
      </div>
      <Suspense>
        {isKanban ? (
          <KanbanBoard suppliers={allSuppliers} userRole={session.user.role} />
        ) : (
          <OrdersTable suppliers={allSuppliers} userRole={session.user.role} />
        )}
      </Suspense>
    </div>
  );
}
