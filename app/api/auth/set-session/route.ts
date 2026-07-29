import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const { userId, email } = await request.json();

  if (!userId || !email) {
    return NextResponse.json({ error: "Missing userId or email" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });

  // Set simple session cookie
  response.cookies.set("fp-user-id", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  // Create user in database if doesn't exist
  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.authId, userId))
      .limit(1);

    if (!existing.length) {
      await db.insert(users).values({
        authId: userId,
        email,
        name: email.split("@")[0] || "User",
        role: "internal",
      });
    }
  } catch (error) {
    console.error("Error creating user:", error);
  }

  return response;
}
