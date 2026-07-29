import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/permissions";
import { ensureApiKeysTable } from "@/lib/db/ensure-tables";
import crypto from "crypto";

// Generate a random API key
function generateKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function GET(request: NextRequest) {
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
  await ensureApiKeysTable();

  const { keyId } = await request.json();
  if (!keyId) {
    return NextResponse.json({ error: "keyId required" }, { status: 400 });
  }

  try {
    await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
  }
}
