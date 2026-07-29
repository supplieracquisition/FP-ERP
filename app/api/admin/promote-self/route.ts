import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await db
    .update(users)
    .set({ role: "admin" })
    .where(eq(users.id, Number(session.user.id)));

  return NextResponse.json({ ok: true, message: "Promoted to admin" });
}
