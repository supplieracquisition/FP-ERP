import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { denyAccountWrite } from "@/lib/permissions";
import { verifiedSignInEmail } from "@/lib/account";

/**
 * The signed-in team member's own account record.
 *
 * There is no [id] segment on this route by design: the user id comes from the
 * session, so there is no parameter through which one team member could read or
 * write another's account. Editing somebody else is an admin action and lives
 * in the admin UI at /users.
 */

/**
 * An allowlist, so a column added to `users` later is non-editable by DEFAULT.
 * A blocklist would not give us that — the new column would be writable from
 * here the moment it existed, and nobody would think to come back and add it.
 *
 * `role` and `supplierId` are the reason this is not just "everything except
 * email": a self-service route that accepted `role` would be a privilege
 * escalation with a nice form around it.
 */
const ACCOUNT_EDITABLE_FIELDS = ["name"] as const;
type AccountEditableField = (typeof ACCOUNT_EDITABLE_FIELDS)[number];

/**
 * Why a key was refused, for the keys where a generic message would leave the
 * caller stuck. Anything not named here still gets refused — see below.
 */
const REFUSAL_REASONS: Record<string, string> = {
  email:
    "Your sign-in email is your Supabase Auth identity and cannot be changed here. Ask an admin.",
  password: "Use POST /api/account/password to change your password.",
  role: "Your role is set by an admin.",
  supplierId: "Your supplier link is set by an admin.",
};

export async function GET() {
  const session = await auth();
  const denied = denyAccountWrite(session);
  if (denied) return denied;

  const userId = Number(session.user.id);

  const [row] = await db
    .select({ name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  return NextResponse.json({
    name: row.name,
    email: row.email,
    role: row.role,
    // Null when Supabase is not in play (local dev stub) or unreachable. The
    // client must treat that as "unknown", never as "they disagree".
    signInEmail: await verifiedSignInEmail(),
  });
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  const denied = denyAccountWrite(session);
  if (denied) return denied;

  // From the session, never the request. See denyAccountWrite().
  const userId = Number(session.user.id);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Expected an object" }, { status: 400 });
  }

  // Refused loudly and by name rather than stripped, following the supplier
  // profile route: dropping the keys and returning 200 would report a save that
  // did not happen, and someone who just tried to change their sign-in email
  // would believe their login had moved.
  const illegal = Object.keys(body).filter(
    (key) => !ACCOUNT_EDITABLE_FIELDS.includes(key as AccountEditableField)
  );

  if (illegal.length > 0) {
    const reasons = illegal.map((key) => REFUSAL_REASONS[key] ?? `${key} cannot be changed here.`);
    return NextResponse.json(
      { error: [...new Set(reasons)].join(" "), fields: illegal },
      { status: 403 }
    );
  }

  // Built by walking the allowlist, never Object.keys(body). Even if the check
  // above were bypassed, an unlisted key has no route into this object.
  const updates: Partial<Record<AccountEditableField, string>> = {};

  for (const field of ACCOUNT_EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    const next = String(body[field]).trim();

    if (next === "") {
      return NextResponse.json({ error: "Your name cannot be empty" }, { status: 400 });
    }
    if (next.length > 120) {
      return NextResponse.json(
        { error: "Your name is too long (120 characters max)" },
        { status: 400 }
      );
    }

    updates[field] = next;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, changed: 0 });
  }

  try {
    await db.update(users).set(updates).where(eq(users.id, userId));
  } catch (err) {
    console.error("[account] update failed", err);
    return NextResponse.json({ error: "Could not save your changes" }, { status: 500 });
  }

  // Supabase's user_metadata.name is deliberately left alone. It is written
  // once at invite time and nothing reads it afterwards — auth() builds the
  // session's name from users.name — so mirroring it would add a second write
  // that can fail independently, for no reader.
  return NextResponse.json({ ok: true, changed: Object.keys(updates).length });
}
