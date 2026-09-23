import { requireAdmin } from "@/lib/permissions";
import { ActivityLog } from "@/components/activity/ActivityLog";

/**
 * The audit trail. Admin only.
 *
 * requireAdmin() here is the page-level gate; GET /api/activity carries its own
 * denyUnlessAdmin(), so the data is refused even if this page were ever reached
 * another way. Both are needed — /api/* is not covered by the proxy gate in the
 * way pages are, and a page guard alone protects nothing that fetches.
 */
export default async function ActivityPage() {
  await requireAdmin();
  return <ActivityLog />;
}
