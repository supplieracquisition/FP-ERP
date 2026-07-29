import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { asc, ne } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";

export async function GET() {
  await requireInternal();
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(ne(users.role, "supplier"))
    .orderBy(asc(users.name));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  await requireInternal();
  const body = await request.json();

  if (!body.name?.trim() || !body.email?.trim()) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  await db.insert(users).values({
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    role: body.role === "admin" ? "admin" : "internal",
  });

  return NextResponse.json({ ok: true });
}
