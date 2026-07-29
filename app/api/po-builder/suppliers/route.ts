import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";

export async function GET() {
  await requireInternal();
  const rows = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      nickname: suppliers.nickname,
      contactEmail: suppliers.contactEmail,
      address: suppliers.address,
      pocName: suppliers.pocName,
      pocPhone: suppliers.pocPhone,
    })
    .from(suppliers)
    .where(eq(suppliers.active, true))
    .orderBy(asc(suppliers.name));
  return NextResponse.json(rows);
}
