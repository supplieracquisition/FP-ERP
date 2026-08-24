import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";
import { inviteSupplierUser } from "@/lib/supplierInvite";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireInternal();
  const { id } = await params;
  const supplierId = Number(id);
  const body = await request.json();

  // poc_user_id is the permanent-reassignment control, and reassignment decides
  // who can see which orders. Left open to any internal user, a team member
  // could name themselves POC of every supplier and read the whole board — so
  // this one field is admin-only while the rest of the form stays editable.
  if (body.pocUserId !== undefined && session.user.role !== "admin") {
    return NextResponse.json(
      { error: "Only an admin can change a supplier's POC" },
      { status: 403 }
    );
  }

  // Create a supplier portal login by invitation. Same helper the create form
  // uses, so there is one account-creation path rather than two that drift.
  if (body.userEmail !== undefined) {
    const result = await inviteSupplierUser({
      supplierId,
      name: body.userName,
      email: body.userEmail,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, invited: result.invited });
  }

  // Build supplier field updates
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.nickname !== undefined) updates.nickname = body.nickname ?? null;
  if (body.contactEmail !== undefined) updates.contactEmail = body.contactEmail ?? null;
  if (body.contactPhone !== undefined) updates.contactPhone = body.contactPhone ?? null;
  if (body.pocName !== undefined) updates.pocName = body.pocName ?? null;
  if (body.pocEmail !== undefined) updates.pocEmail = body.pocEmail ?? null;
  if (body.pocPhone !== undefined) updates.pocPhone = body.pocPhone ?? null;
  if (body.salesRepName !== undefined) updates.salesRepName = body.salesRepName ?? null;
  if (body.address !== undefined) updates.address = body.address ?? null;
  if (body.comments !== undefined) updates.comments = body.comments ?? null;
  if (body.active !== undefined) updates.active = Boolean(body.active);
  if (body.turnTime !== undefined) updates.turnTime = body.turnTime;
  if (body.capacityUnits !== undefined) updates.capacityUnits = body.capacityUnits;
  if (body.testPrintTat !== undefined) updates.testPrintTat = body.testPrintTat;
  if (body.productionTime !== undefined) updates.productionTime = body.productionTime;
  if (body.shippingTimeAir !== undefined) updates.shippingTimeAir = body.shippingTimeAir;
  if (body.shippingTimeSea !== undefined) updates.shippingTimeSea = body.shippingTimeSea;
  if (body.pocUserId !== undefined) updates.pocUserId = body.pocUserId ?? null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await db.update(suppliers).set(updates).where(eq(suppliers.id, supplierId));

  return NextResponse.json({ ok: true });
}
