import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supplierOverrides } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

export async function POST(request: NextRequest) {
  const session = await requireInternal();
  const body = await request.json();
  const { supplierId, date, reason } = body;

  if (!supplierId || !date) {
    return NextResponse.json({ error: "supplierId and date are required" }, { status: 400 });
  }

  // Upsert: delete existing then insert
  await db
    .delete(supplierOverrides)
    .where(and(eq(supplierOverrides.supplierId, Number(supplierId)), eq(supplierOverrides.date, date)));

  await db.insert(supplierOverrides).values({
    supplierId: Number(supplierId),
    date,
    reason: reason || null,
  });

  await logActivity(session, {
    action: "capacity.override",
    entityType: "capacity",
    entityId: `${supplierId}:${date}`,
    supplierId: Number(supplierId),
    summary: `Set a capacity override for ${date}${reason ? ` — ${reason}` : ""}`,
    details: { date, reason: reason || null },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await requireInternal();
  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get("supplierId");
  const date = searchParams.get("date");

  if (!supplierId || !date) {
    return NextResponse.json({ error: "supplierId and date are required" }, { status: 400 });
  }

  await db
    .delete(supplierOverrides)
    .where(and(eq(supplierOverrides.supplierId, Number(supplierId)), eq(supplierOverrides.date, date)));

  await logActivity(session, {
    action: "capacity.override",
    entityType: "capacity",
    entityId: `${supplierId}:${date}`,
    supplierId: Number(supplierId),
    summary: `Removed the capacity override for ${date}`,
    details: { date, removed: true },
  });

  return NextResponse.json({ ok: true });
}
