import { requireInternal } from "@/lib/permissions";
import { signOut } from "@/lib/actions/auth";
import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";

export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireInternal();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-screen-2xl px-6 flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="font-bold text-sm tracking-wide">FRESH PRINTS ERP</span>
            <nav className="flex items-center gap-6 text-sm">
              <Link
                href="/orders"
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                Orders
              </Link>
              <Link
                href="/import"
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                Import
              </Link>
              <Link
                href="/capacity"
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                Capacity
              </Link>
              <Link
                href="/po-builder"
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                PO Builder
              </Link>
              <Link
                href="/product-library"
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                Product Library
              </Link>
              {session.user.role === "admin" && (
                <Link
                  href="/suppliers"
                  className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
                >
                  Suppliers
                </Link>
              )}
              {session.user.role === "admin" && (
                <>
                  <Link
                    href="/admin/api-keys"
                    className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
                  >
                    API Keys
                  </Link>
                  <Link
                    href="/users"
                    className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
                  >
                    Team
                  </Link>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/account"
              className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
              title="Your account"
            >
              {session.user.email}
            </Link>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">
              {session.user.role}
            </span>
            <NotificationBell />
            <form action={signOut}>
              <button
                type="submit"
                className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-screen-2xl px-6 py-6">
        {children}
      </main>
    </div>
  );
}
