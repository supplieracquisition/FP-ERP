import { requireInternal } from "@/lib/permissions";
import { UsersManager } from "@/components/users/UsersManager";

/**
 * Readable by any internal user — the roster is useful for coordination — with
 * the actions shown only to admins. Hiding them is presentation, not security:
 * the /api/users routes refuse a non-admin regardless of what the page renders.
 */
export default async function UsersPage() {
  const session = await requireInternal();
  return <UsersManager isAdmin={session.user.role === "admin"} />;
}
