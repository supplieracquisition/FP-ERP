import { requireAdmin } from "@/lib/permissions";
import { ApiKeysManager } from "./ApiKeysManager";

/**
 * API keys, admin-only.
 *
 * This page used to BE the client component, which meant it carried no
 * server-side check — the only gate above it was the (internal) layout, and
 * that admits any team member. The nav link was hidden from non-admins, but
 * hiding a link is presentation, not a guard: typing the URL rendered the whole
 * key-management screen. It then failed by accident rather than by design,
 * because the API behind it redirected non-admins and the fetches landed on
 * HTML, leaving a real-looking page with an empty table and a Create button
 * that silently did nothing.
 *
 * requireAdmin() is right HERE, where a redirect to /orders is the correct
 * behaviour for a page. The route handlers use adminSession() instead, because
 * a redirect from an API reads as success to fetch().
 */
export default async function ApiKeysPage() {
  await requireAdmin();
  return <ApiKeysManager />;
}
