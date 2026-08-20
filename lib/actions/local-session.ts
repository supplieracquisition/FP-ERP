"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { localAuthEnabled } from "@/lib/auth-mode";

export async function switchLocalUser(userId: number) {
  if (!localAuthEnabled) redirect("/login");

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  cookieStore.set("fp_local_user_id", String(userId), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
  });
  cookieStore.delete("fp_impersonate");

  redirect(user.role === "supplier" ? "/supplier/orders" : "/orders");
}
