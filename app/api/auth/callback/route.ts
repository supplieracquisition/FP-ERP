import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const { user_id, email, user_name } = await request.json();

  if (!user_id || !email) {
    return NextResponse.json({ error: "Missing user_id or email" }, { status: 400 });
  }

  try {
    // Check if user exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.authId, user_id))
      .limit(1);

    // Create user if doesn't exist
    if (!existing.length) {
      await db.insert(users).values({
        authId: user_id,
        email,
        name: user_name || email.split("@")[0] || "User",
        role: "internal",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Callback error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
