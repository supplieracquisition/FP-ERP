import { requireSupplier } from "@/lib/permissions";
import { signOut } from "@/lib/actions/auth";
import { stopImpersonating } from "@/lib/actions/impersonate";
import NotificationBell from "@/components/NotificationBell";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSupplier();

  // Fetch supplier POC name
  let pocName = "";
  if (session.user.supplierId) {
    const supplier = await db
      .select({ pocName: suppliers.pocName })
      .from(suppliers)
      .where(eq(suppliers.id, Number(session.user.supplierId)))
      .limit(1);
    pocName = supplier[0]?.pocName || "";
  }

  return (
    <div className="min-h-screen flex flex-col">
      {session.impersonating && (
        <div className="bg-amber-50 border-b border-amber-300 px-6 py-2 flex items-center justify-between">
          <span className="text-xs text-amber-800">
            <span className="font-semibold">Admin preview:</span> viewing as supplier{" "}
            <strong>{session.impersonating.supplierName}</strong>
          </span>
          <form action={stopImpersonating}>
            <button
              type="submit"
              className="text-xs font-semibold text-amber-900 underline hover:text-amber-700 transition-colors"
            >
              Exit → Back to admin
            </button>
          </form>
        </div>
      )}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-screen-2xl px-6 flex h-14 items-center justify-between">
          <span className="font-bold text-sm tracking-wide">FRESH PRINTS</span>
          <div className="flex items-center gap-4">
            <div className="text-right">
              {pocName && <div className="text-xs font-medium text-gray-700">{pocName}</div>}
              <div className="text-xs text-gray-500">{session.user.email}</div>
            </div>
            {!session.impersonating && <NotificationBell />}
            {!session.impersonating && (
              <form action={signOut}>
                <button type="submit" className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
                  Sign out
                </button>
              </form>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-screen-2xl px-6 py-6">
        {children}
      </main>
    </div>
  );
}
