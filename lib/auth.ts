import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users, suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

export type AppSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    supplierId: string | null;
  };
  impersonating?: {
    supplierId: number;
    supplierName: string;
  };
};

async function applyImpersonation(session: AppSession): Promise<AppSession> {
  if (session.user.role !== "admin") return session;
  const cookieStore = await cookies();
  const supplierIdStr = cookieStore.get("fp_impersonate")?.value;
  if (!supplierIdStr) return session;
  const supplierId = Number(supplierIdStr);
  if (!supplierId) return session;

  const [supplier] = await db
    .select({ id: suppliers.id, name: suppliers.name, nickname: suppliers.nickname })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  if (!supplier) return session;

  return {
    user: { ...session.user, role: "supplier", supplierId: String(supplierId) },
    impersonating: { supplierId, supplierName: supplier.nickname ?? supplier.name },
  };
}

export async function auth(): Promise<AppSession | null> {
  const cookieStore = await cookies();

  // Local dev mode (no DATABASE_URL): use cookie-selected user (default: id=1).
  if (!process.env.DATABASE_URL) {
    const localUserIdStr = cookieStore.get("fp_local_user_id")?.value;
    const userId = localUserIdStr ? Number(localUserIdStr) : 1;
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;
    const session: AppSession = {
      user: {
        id: String(user.id),
        email: user.email,
        name: user.name,
        role: user.role,
        supplierId: user.supplierId ? String(user.supplierId) : null,
      },
    };
    return applyImpersonation(session);
  }

  // Production: use fp-user-id cookie (simple cookie-based auth)
  const userIdCookie = cookieStore.get("fp-user-id")?.value;
  if (!userIdCookie) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.authId, userIdCookie))
    .limit(1);

  if (!user) return null;

  const session: AppSession = {
    user: {
      id: String(user.id),
      email: user.email,
      name: user.name,
      role: user.role,
      supplierId: user.supplierId ? String(user.supplierId) : null,
    },
  };
  return applyImpersonation(session);
}
