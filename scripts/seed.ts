import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { users } from "../lib/db/schema";
import { eq } from "drizzle-orm";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function seed() {
  const { db } = await import("../lib/db");

  const email = "admin@freshprints.com";
  const password = "freshprints2026";

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    console.log("Admin user already exists:", email);
    process.exit(0);
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    console.error("Failed to create Supabase auth user:", error?.message);
    process.exit(1);
  }

  await db.insert(users).values({
    authId: data.user.id,
    email,
    name: "Admin",
    role: "admin",
  });

  console.log("✓ Created admin user");
  console.log("  Email:   ", email);
  console.log("  Password:", password);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
