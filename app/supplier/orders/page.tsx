import { requireSupplier } from "@/lib/permissions";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { KanbanBoard } from "@/components/orders/KanbanBoard";
import { Suspense } from "react";
import ViewToggle from "@/app/(internal)/orders/ViewToggle";

export default async function SupplierOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireSupplier();
  const { view } = await searchParams;
  const isKanban = view === "kanban";

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Your Orders</h1>
        <ViewToggle current={isKanban ? "kanban" : "table"} basePath="/supplier/orders" />
      </div>
      <Suspense>
        {isKanban ? (
          // No team roster and no claim UI: a supplier's scope never includes
          // pool orders, so there is nothing here that could be claimed.
          <KanbanBoard
            suppliers={[]}
            userRole={session.user.role}
            userId={Number(session.user.id)}
            team={[]}
          />
        ) : (
          <OrdersTable suppliers={[]} userRole={session.user.role} />
        )}
      </Suspense>
    </div>
  );
}
