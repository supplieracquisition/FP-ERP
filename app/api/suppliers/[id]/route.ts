import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { inviteSupplierUser } from "@/lib/invite";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Not requireInternal(): it signals by redirect(), which a route handler
  // turns into a 307 to a page. The write does abort — redirect() throws — but
  // fetch() follows the hop, lands on HTML and reports res.ok, so a refused
  // request reads as a successful one. Same reasoning as denyNonAdmin().
  //
  // This is the internal-facing editor, and it can write the operational
  // fields. A supplier reaching it must be refused outright; their own,
  // narrower path is PATCH /api/supplier/profile.
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (session.user.role === "supplier") {
    return NextResponse.json(
      { error: "Suppliers cannot edit supplier records" },
      { status: 403 }
    );
  }

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
