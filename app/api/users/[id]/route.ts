import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireInternal();
  const { id } = await params;
  // password resets require Supabase in production; no-op in local SQLite mode
  await request.json(); // consume body
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, Number(id))).limit(1);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireInternal();
  const { id } = await params;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, Number(id))).limit(1);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(users).where(eq(users.id, Number(id)));
  return NextResponse.json({ ok: true });
}
