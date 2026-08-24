import { requireInternal, scopeSupplierIds } from "@/lib/permissions";
import { db } from "@/lib/db";
import { suppliers, users } from "@/lib/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
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

  // The supplier filter dropdown. An admin picks from every active supplier; a
  // team member picks from the ones they handle, since filtering by any other
  // supplier returns nothing anyway. Cosmetic only — /api/orders enforces the
  // real scope, and this list is not what makes that safe.
  const pocIds = session.user.role === "admin" ? null : await scopeSupplierIds(session);

  const allSuppliers =
    pocIds && pocIds.length === 0
      ? []
      : await db
          .select({ id: suppliers.id, name: suppliers.name })
          .from(suppliers)
          .where(
            pocIds
              ? and(eq(suppliers.active, true), inArray(suppliers.id, pocIds))
              : eq(suppliers.active, true)
          );

  // Who holds a claim, by id. /api/orders returns processor_user_id but not the
  // name — a second join onto users needs drizzle's alias(), which is imported
  // per-dialect, and this schema picks its dialect at runtime. Resolving the id
  // against the roster here costs one small query and no extra round trip.
  const team = isKanban
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(ne(users.role, "supplier"))
    : [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Orders</h1>
        <ViewToggle current={isKanban ? "kanban" : "table"} />
      </div>
      <Suspense>
        {isKanban ? (
          <KanbanBoard
            suppliers={allSuppliers}
            userRole={session.user.role}
            userId={Number(session.user.id)}
            team={team}
          />
        ) : (
          <OrdersTable suppliers={allSuppliers} userRole={session.user.role} />
        )}
      </Suspense>
    </div>
  );
}
