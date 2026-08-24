import { requireInternal } from "@/lib/permissions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifiedSignInEmail } from "@/lib/account";
import { supabaseAuthEnabled } from "@/lib/auth-mode";
import AccountForm from "@/components/account/AccountForm";

export default async function AccountPage() {
  // The user is the session's own. Nothing on this page is keyed by a route
  // parameter, so there is no other account it could be made to render.
  const session = await requireInternal();

  const [row] = await db
    .select({ name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, Number(session.user.id)))
    .limit(1);

  if (!row) {
    return (
      <div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Your Account</h1>
        <p className="text-sm text-gray-500">
          We could not load your account. Please contact an admin.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Your Account</h1>
      <AccountForm
        initialName={row.name}
        email={row.email}
        role={row.role}
        signInEmail={await verifiedSignInEmail()}
        passwordsAvailable={supabaseAuthEnabled}
      />
    </div>
  );
}
