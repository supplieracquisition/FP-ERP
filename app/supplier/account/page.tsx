import { requireSupplier } from "@/lib/permissions";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import AccountForm, {
  type EditableValues,
  type OperationalValues,
} from "@/components/supplier/AccountForm";

export default async function SupplierAccountPage() {
  const session = await requireSupplier();

  const [row] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, Number(session.user.supplierId)))
    .limit(1);

  if (!row) {
    return (
      <div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Your Account</h1>
        <p className="text-sm text-gray-500">
          We could not load your account. Please contact Fresh Prints.
        </p>
      </div>
    );
  }

  // Inputs are controlled, so nulls become empty strings here rather than in
  // the client component.
  const editable: EditableValues = {
    name: row.name ?? "",
    contactEmail: row.contactEmail ?? "",
    contactPhone: row.contactPhone ?? "",
    pocName: row.pocName ?? "",
    pocEmail: row.pocEmail ?? "",
    pocPhone: row.pocPhone ?? "",
    address: row.address ?? "",
  };

  const operational: OperationalValues = {
    testPrintTat: row.testPrintTat,
    productionTime: row.productionTime,
    shippingTimeSea: row.shippingTimeSea,
    shippingTimeAir: row.shippingTimeAir,
    capacityUnits: row.capacityUnits,
    turnTime: row.turnTime,
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Your Account</h1>
      <AccountForm
        initial={editable}
        operational={operational}
        signInEmail={session.user.email}
      />
    </div>
  );
}
