import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  await requireAdmin();
  const { supplierId } = await request.json();
  if (!supplierId) {
    return NextResponse.json({ error: "supplierId required" }, { status: 400 });
  }

  const [supplier] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.id, Number(supplierId)))
    .limit(1);

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("fp_impersonate", String(supplierId), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("fp_impersonate");
  return response;
}
