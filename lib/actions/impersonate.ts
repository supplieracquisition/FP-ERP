"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function stopImpersonating() {
  const cookieStore = await cookies();
  cookieStore.delete("fp_impersonate");
  redirect("/suppliers");
}
