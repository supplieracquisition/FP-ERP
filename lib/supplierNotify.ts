import { db } from "@/lib/db";
import { suppliers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendMail } from "@/lib/email";

const LOGISTICS_EMAIL = process.env.LOGISTICS_EMAIL ?? "logistics@freshprints.com";

/**
 * Escape supplier-controlled text before it goes into an email body.
 *
 * Every string this module interpolates originates from a supplier: their
 * free-text change request, and the new values in a profile diff. Without this
 * a supplier could put markup — or a link — into mail that lands in the
 * logistics inbox looking like it came from us.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Flatten a value used in a Subject header.
 *
 * suppliers.name became supplier-editable with the account page, and a subject
 * is a mail header: a CR or LF in one is header-injection shaped. nodemailer
 * encodes subjects itself, so this is a second line of defence rather than the
 * only one — but the field is now attacker-adjacent and the header should not
 * depend on the library's behaviour staying the same.
 */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Resolve who hears about a supplier's action: logistics, CC the supplier's
 * assigned internal POC.
 *
 * This is the same recipient rule createNotification() applies for
 * team-directed supplier actions, lifted out because that function reaches its
 * supplier through an order and these flows have no order to reach through.
 * Kept as one function so the two paths cannot drift on who gets told.
 */
async function recipients(supplierId: number) {
  const [supplier] = await db
    .select({ name: suppliers.name, pocUserId: suppliers.pocUserId })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  let pocEmail: string | undefined;
  if (supplier?.pocUserId) {
    const [poc] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, supplier.pocUserId))
      .limit(1);
    pocEmail = poc?.email;
  }

  return { supplierName: supplier?.name ?? "A supplier", pocEmail };
}

function footer(supplierName: string, actorEmail: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="color:#6b7280;font-size:12px;margin:0;">
      Submitted by ${esc(actorEmail)} for ${esc(supplierName)} at ${new Date().toISOString()}.
      <br>
      <a href="${appUrl}/suppliers">Open suppliers in the ERP →</a>
    </p>
  `;
}

export interface FieldChange {
  label: string;
  before: string;
  after: string;
}

/**
 * Group A: the supplier edited their own account details.
 *
 * Sent after the write commits, so the mail never describes a change that
 * failed to save.
 */
export async function notifyProfileUpdated(opts: {
  supplierId: number;
  actorEmail: string;
  changes: FieldChange[];
}): Promise<void> {
  const { supplierName, pocEmail } = await recipients(opts.supplierId);

  const rows = opts.changes
    .map(
      (c) => `
        <tr>
          <td style="padding:6px 12px 6px 0;color:#374151;"><strong>${esc(c.label)}</strong></td>
          <td style="padding:6px 12px 6px 0;color:#9ca3af;text-decoration:line-through;">${esc(c.before) || "<em>empty</em>"}</td>
          <td style="padding:6px 0;color:#111827;">${esc(c.after) || "<em>empty</em>"}</td>
        </tr>`
    )
    .join("");

  await sendMail({
    to: LOGISTICS_EMAIL,
    cc: pocEmail,
    subject: `[FP ERP] ${oneLine(supplierName)} updated their account details`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;">
        <h2 style="color:#111827;">Supplier account details updated</h2>
        <p style="color:#374151;">
          <strong>${esc(supplierName)}</strong> changed the following on their account page.
        </p>
        <table style="border-collapse:collapse;font-size:14px;margin:16px 0;">
          <tr style="text-align:left;color:#6b7280;font-size:12px;">
            <th style="padding:0 12px 4px 0;">Field</th>
            <th style="padding:0 12px 4px 0;">Was</th>
            <th style="padding:0 0 4px 0;">Now</th>
          </tr>
          ${rows}
        </table>
        ${footer(supplierName, opts.actorEmail)}
      </div>
    `,
  });
}

/**
 * Group B: the supplier asked for a change to a field they cannot edit.
 *
 * Delivery is email only — notifications.order_item_id is NOT NULL with an FK
 * to order_items, so a request that belongs to no order cannot be represented
 * as an in-app notification without a schema migration.
 */
export async function notifyChangeRequested(opts: {
  supplierId: number;
  actorEmail: string;
  message: string;
  currentValues: { label: string; value: string }[];
}): Promise<void> {
  const { supplierName, pocEmail } = await recipients(opts.supplierId);

  const current = opts.currentValues
    .map(
      (v) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${esc(v.label)}</td>
          <td style="padding:4px 0;color:#111827;">${esc(v.value) || "—"}</td></tr>`
    )
    .join("");

  await sendMail({
    to: LOGISTICS_EMAIL,
    cc: pocEmail,
    subject: `[FP ERP] ${oneLine(supplierName)} requested a change to operational settings`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;">
        <h2 style="color:#111827;">Operational change request</h2>
        <p style="color:#374151;">
          <strong>${esc(supplierName)}</strong> cannot edit these fields themselves and has
          asked for a change. Nothing has been changed in the ERP — apply it manually if approved.
        </p>
        <div style="background:#f9fafb;padding:12px 16px;border-radius:6px;margin:16px 0;">
          <p style="margin:0 0 8px 0;color:#374151;font-weight:bold;">Their request</p>
          <p style="white-space:pre-wrap;margin:0;color:#111827;">${esc(opts.message)}</p>
        </div>
        <p style="margin:16px 0 4px 0;color:#374151;font-weight:bold;">Current settings</p>
        <table style="border-collapse:collapse;font-size:14px;">${current}</table>
        ${footer(supplierName, opts.actorEmail)}
      </div>
    `,
  });
}
