/**
 * The vocabulary of the audit log.
 *
 * Its own module, with NO database import, because both sides need it: the
 * server writes these strings and the log page renders them in a filter
 * dropdown. Importing lib/activity.ts from a client component would drag the
 * whole drizzle client into the browser bundle.
 *
 * The keys are stored in activity_log.action and are permanent — a row written
 * last year still says "order.claim". Renaming one silently orphans every
 * historical entry from its label, so add new keys rather than editing old
 * ones. The labels are display text and can be reworded freely.
 */
export const ACTION_LABELS: Record<string, string> = {
  // Orders
  "order.claim": "Claimed order",
  "order.release": "Released claim",
  "order.nominate": "Nominated supplier",
  "order.assign": "Assigned to supplier (PO built)",
  "order.reassign": "Reassigned supplier",
  "order.stage": "Moved production stage",
  "order.edit": "Edited order",
  "order.delete": "Deleted order",
  "order.bulk_delete": "Deleted orders in bulk",
  "order.clear_all": "Cleared ALL orders",
  "order.comment": "Commented",
  "order.image": "Uploaded image",
  "order.report": "Reported an issue",
  "order.test_print": "Test print update",
  "order.dates": "Saved PO dates",
  // Suppliers
  "supplier.create": "Added supplier",
  "supplier.edit": "Edited supplier",
  "supplier.delete": "Removed supplier",
  "supplier.profile": "Supplier edited own profile",
  "supplier.change_request": "Supplier requested a change",
  "supplier.sync": "Synced suppliers from MTO",
  // People
  "user.create": "Added team member",
  "user.role": "Changed role",
  "user.delete": "Removed team member",
  "user.reset": "Sent password reset",
  "account.edit": "Edited own account",
  // System
  "import.run": "Imported orders",
  "capacity.override": "Set capacity override",
  "apikey.create": "Created API key",
  "apikey.delete": "Revoked API key",
};

/** Filter dropdown groupings. Order here is the order shown. */
export const ACTION_GROUPS: { label: string; prefix: string }[] = [
  { label: "Orders", prefix: "order." },
  { label: "Suppliers", prefix: "supplier." },
  { label: "People", prefix: "user." },
  { label: "System", prefix: "import." },
];

/** Display text for a stored action key, degrading to the key itself. */
export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
