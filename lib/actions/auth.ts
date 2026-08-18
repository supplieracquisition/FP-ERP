"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function signOut() {
  if (!process.env.DATABASE_URL) {
    // Local dev: API route handles cookie clearing + redirect
    redirect("/api/local-session");
  }
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Supabase's signOut does not touch our own session cookie.
  const cookieStore = await cookies();
  cookieStore.delete("fp-user-id");
  cookieStore.delete("fp_impersonate");

  redirect("/login");
}
