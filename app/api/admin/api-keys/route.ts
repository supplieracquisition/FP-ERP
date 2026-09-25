import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { adminSession } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { ensureApiKeysTable } from "@/lib/db/ensure-tables";
import crypto from "crypto";

// Generate a random API key
function generateKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function GET(request: NextRequest) {
  // adminSession() rather than requireAdmin(): requireAdmin() signals by
  // redirect(), and fetch() follows the hop to a page and reports res.ok, so a
  // refused request reads as a successful one. On this screen that meant a
  // non-admin got the full key-management UI with an empty table and a Create
  // button that quietly did nothing.
  const { denied } = await adminSession();
  if (denied) return denied;
  await ensureApiKeysTable();

  try {
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys);

    return NextResponse.json({ keys });
  } catch (error) {
    return NextResponse.json({ keys: [] });
  }
}

export async function POST(request: NextRequest) {
  const { session, denied } = await adminSession();
  if (denied) return denied;
  await ensureApiKeysTable();

  const { name } = await request.json();
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  if (!admin) {
    return NextResponse.json({ error: "No admin user found" }, { status: 500 });
  }

  try {
    const plainKey = generateKey();
    const hashedKey = crypto.createHash("sha256").update(plainKey).digest("hex");

    await db.insert(apiKeys).values({
      name,
      key: hashedKey,
      createdBy: admin.id,
    });

    // The key itself is never logged — only that one was made, and by whom.
    // The audit trail is long-lived and widely read; a credential in it would
    // outlive every rotation.
    await logActivity(session, {
      action: "apikey.create",
      entityType: "api_key",
      summary: `Created API key "${name}"`,
    });

    return NextResponse.json({
      message: "API key created (save this, you won't see it again)",
      key: plainKey,
      name,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { session, denied } = await adminSession();
  if (denied) return denied;
  await ensureApiKeysTable();

  const { keyId } = await request.json();
  if (!keyId) {
    return NextResponse.json({ error: "keyId required" }, { status: 400 });
  }

  // Read the name before the delete, so the entry can say which key it was.
  const [doomed] = await db
    .select({ name: apiKeys.name })
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1);
  const doomedName = doomed?.name ?? null;

  try {
    await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
    await logActivity(session, {
      action: "apikey.delete",
      entityType: "api_key",
      entityId: keyId,
      summary: `Revoked API key ${doomedName ? `"${doomedName}"` : `#${keyId}`}`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
  }
}
