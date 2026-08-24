/**
 * Which supplier columns a supplier may write to their own record.
 *
 * Group B — the operational fields (test_print_tat, production_time,
 * shipping_time_air, shipping_time_sea, capacity_units, turn_time) — is
 * enforced by ABSENCE from this list rather than by a blocklist. That
 * direction matters: a column added to the suppliers table later is
 * non-editable by default. A blocklist would silently hand suppliers write
 * access to every field added after it was written.
 *
 * Two fields are absent for their own reasons:
 *  - poc_user_id is the order-scoping control (see orderScope in
 *    lib/permissions.ts). A supplier writing it would reassign which internal
 *    user can see their orders. It is admin-only even for internal users.
 *  - users.email is the Supabase auth identity, not a supplier column at all.
 *    The editable "email" here is suppliers.contact_email, the company contact
 *    address. Changing the sign-in address is an auth operation, not a profile
 *    edit, and does not belong on this path.
 */
export const SUPPLIER_EDITABLE_FIELDS = [
  "name",
  "contactEmail",
  "contactPhone",
  "pocName",
  "pocEmail",
  "pocPhone",
  "address",
] as const;

export type SupplierEditableField = (typeof SUPPLIER_EDITABLE_FIELDS)[number];

/** Human labels, used in the email diff and in the UI. */
export const SUPPLIER_FIELD_LABELS: Record<SupplierEditableField, string> = {
  name: "Company name",
  contactEmail: "Company email",
  contactPhone: "Company phone",
  pocName: "Contact name",
  pocEmail: "Contact email",
  pocPhone: "Contact phone",
  address: "Address",
};

export function isSupplierEditable(key: string): key is SupplierEditableField {
  return (SUPPLIER_EDITABLE_FIELDS as readonly string[]).includes(key);
}

/**
 * The submitted keys a supplier is not allowed to write.
 *
 * Returned so the route can name them in a 403. Naming them is deliberate:
 * silently dropping the keys and returning 200 would tell the supplier their
 * change saved when it did not.
 */
export function illegalSupplierFields(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter((k) => !isSupplierEditable(k));
}
