"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signOut() {
  if (!process.env.DATABASE_URL) {
    // Local dev: API route handles cookie clearing + redirect
    redirect("/api/local-session");
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
