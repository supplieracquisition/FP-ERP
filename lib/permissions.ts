import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireInternal() {
  const session = await requireAuth();
  if (session.user.role === "supplier") redirect("/supplier/orders");
  return session;
}


export async function requireAdmin() {
  const session = await requireAuth();
  if (session.user.role !== "admin") redirect("/orders");
  return session;
}

export async function requireSupplier() {
  const session = await requireAuth();
  if (session.user.role !== "supplier") redirect("/orders");
  return session as typeof session & { user: { supplierId: string } };
}

export function isInternal(role: string) {
  return role === "admin" || role === "internal";
}
