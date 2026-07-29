import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const { access_token, refresh_token, user_id, email } = await request.json();

  if (!access_token || !user_id) {
    return NextResponse.json({ error: "Missing tokens" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });

  // Set session cookies directly on response
  response.cookies.set("sb-access-token", access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  if (refresh_token) {
    response.cookies.set("sb-refresh-token", refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }

  // Create user in database if doesn't exist
  if (user_id && email) {
    try {
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.authId, user_id))
        .limit(1);

      if (!existing.length) {
        await db.insert(users).values({
          authId: user_id,
          email,
          name: email.split("@")[0] || "User",
          role: "internal",
        });
      }
    } catch (error) {
      console.error("Error creating/checking user:", error);
    }
  }

  return response;
}
