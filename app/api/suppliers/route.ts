import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers, users, orderItems } from "@/lib/db/schema";
import { asc, eq, ne, sql } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";

export async function GET() {
  await requireInternal();

  const allSuppliers = await db.select().from(suppliers).orderBy(asc(suppliers.name));

  const [supplierUsers, internalUsers, orderCounts] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, supplierId: users.supplierId })
      .from(users).where(eq(users.role, "supplier")),
    db.select({ id: users.id, name: users.name })
      .from(users).where(ne(users.role, "supplier")).orderBy(asc(users.name)),
    db.select({ supplierId: orderItems.supplierId, count: sql<number>`count(*)` })
      .from(orderItems).groupBy(orderItems.supplierId),
  ]);

  const countsMap = new Map(orderCounts.map((r) => [r.supplierId, Number(r.count)]));
  const pocMap = new Map(internalUsers.map((u) => [u.id, u.name]));

  const usersMap = new Map<number, { id: number; name: string; email: string }[]>();
  for (const u of supplierUsers) {
    if (u.supplierId) {
      if (!usersMap.has(u.supplierId)) usersMap.set(u.supplierId, []);
      usersMap.get(u.supplierId)!.push({ id: u.id, name: u.name, email: u.email });
    }
  }

  return NextResponse.json({
    suppliers: allSuppliers.map((s) => ({
      ...s,
      orderCount: countsMap.get(s.id) ?? 0,
      users: usersMap.get(s.id) ?? [],
      pocName: s.pocUserId ? (pocMap.get(s.pocUserId) ?? null) : null,
    })),
    internalUsers,
  });
}

export async function POST(request: NextRequest) {
  await requireInternal();
  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  await db.insert(suppliers).values({
    name: body.name.trim(),
    contactEmail: body.contactEmail ?? null,
  });

  return NextResponse.json({ ok: true });
}
