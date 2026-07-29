"use client";

import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

export function AuthSync() {
  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Listen to auth state changes and sync to server
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        // Send session to server to set cookies
        await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            user_id: session.user.id,
            email: session.user.email,
          }),
        });
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  return null;
}
