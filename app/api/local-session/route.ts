import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { localAuthEnabled } from "@/lib/auth-mode";

// Local dev only: email+password login (any password accepted in dev mode)
export async function POST(request: NextRequest) {
  if (!localAuthEnabled) {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const body = await request.json();
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "No account found with that email" }, { status: 401 });
  }

  const dest = user.role === "supplier" ? "/supplier/orders" : "/orders";
  const response = NextResponse.json({ ok: true, redirect: dest });
  response.cookies.set("fp_local_user_id", String(user.id), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
  });
  response.cookies.delete("fp_impersonate");
  return response;
}

// Local dev only: switch the active user via GET redirect (no server action needed)
export async function GET(request: NextRequest) {
  if (!localAuthEnabled) {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const userId = Number(searchParams.get("userId"));

  if (!userId) {
    // Sign out: clear cookie, redirect to login
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("fp_local_user_id");
    response.cookies.delete("fp_impersonate");
    return response;
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const dest = user.role === "supplier" ? "/supplier/orders" : "/orders";
  const response = NextResponse.redirect(new URL(dest, request.url));
  response.cookies.set("fp_local_user_id", String(userId), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
  });
  response.cookies.delete("fp_impersonate");
  return response;
}
