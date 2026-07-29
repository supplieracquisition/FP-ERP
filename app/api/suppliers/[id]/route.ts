import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireInternal();
  const { id } = await params;
  const supplierId = Number(id);
  const body = await request.json();

  // Create a supplier portal login
  if (body.userEmail !== undefined) {
    if (!body.userName?.trim() || !body.userEmail?.trim()) {
      return NextResponse.json({ error: "userName and userEmail are required" }, { status: 400 });
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.userEmail.trim().toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    await db.insert(users).values({
      name: body.userName.trim(),
      email: body.userEmail.trim().toLowerCase(),
      role: "supplier",
      supplierId,
    });

    return NextResponse.json({ ok: true });
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
