import { requireInternal, scopeSupplierIds } from "@/lib/permissions";
import { db } from "@/lib/db";
import { suppliers, users } from "@/lib/db/schema";
import { asc, eq, ne } from "drizzle-orm";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { KanbanBoard } from "@/components/orders/KanbanBoard";
import { Suspense } from "react";
import ViewToggle from "./ViewToggle";
import { HowItWorks } from "@/components/help/HowItWorks";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireInternal();
  const { view } = await searchParams;
  const isKanban = view === "kanban";

  // Two dropdowns, two different questions — do not collapse these back into
  // one list.
  //
  // nominateSuppliers is every active supplier, for every internal user.
  // Nominating says who should MAKE an order; it is not a claim about who
  // handles that supplier, and anyone internal may work anything in the pool.
  // This list was POC-scoped once, which was not the cosmetic restriction it
  // looked like: the PO Builder takes the PO's manufacturer straight from the
  // nomination (POBuilder.saveAndExport), so a supplier missing from here could
  // not be nominated OR assigned to at all, and a team member who is POC of
  // nothing got an empty list and could nominate nobody.
  const activeSuppliers = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.active, true))
    .orderBy(asc(suppliers.name));

  // filterSuppliers stays scoped. Both views filter on order_items.supplier_id
  // — orders already ASSIGNED — and an internal user only ever sees those for
  // suppliers they are POC of, so any other entry here is a dropdown option
  // that always returns nothing. Cosmetic only: /api/orders enforces the real
  // scope, and this list is not what makes that safe.
  const pocIds = session.user.role === "admin" ? null : await scopeSupplierIds(session);
  const filterSuppliers = pocIds
    ? activeSuppliers.filter((s) => pocIds.includes(s.id))
    : activeSuppliers;

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
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">Orders</h1>
        <div className="flex items-center gap-2">
          <HowItWorks topic="orders" />
          <ViewToggle current={isKanban ? "kanban" : "table"} />
        </div>
      </div>
      <Suspense>
        {isKanban ? (
          <KanbanBoard
            suppliers={filterSuppliers}
            nominateSuppliers={activeSuppliers}
            userRole={session.user.role}
            userId={Number(session.user.id)}
            team={team}
          />
        ) : (
          <OrdersTable suppliers={filterSuppliers} userRole={session.user.role} />
        )}
      </Suspense>
    </div>
  );
}
