import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const { access_token } = await request.json();

  if (!access_token) {
    return NextResponse.json({ error: "Missing access_token" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("set-session: Supabase env vars are not configured");
    return NextResponse.json({ error: "Auth is not configured" }, { status: 500 });
  }

  // Verify the token against Supabase. The user id and email come only from the
  // verified token — never from the request body.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(access_token);

  if (error || !data.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  // Accounts are provisioned manually. A valid Supabase token is not enough on
  // its own — the user must already exist here.
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authId, data.user.id))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "No account exists for this user" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set("fp-user-id", data.user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return response;
}
