import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export type ApiKeyRecord = { id: number; name: string };

/**
 * Verify a machine caller's `Authorization: Bearer <key>` header.
 *
 * Returns the matching key record, or null when the header is missing,
 * malformed, or the key is unknown. Keys are stored as sha256 hashes, so the
 * presented key is hashed and compared — the plaintext is never persisted.
 *
 * On success the key's last_used_at is stamped, which is what makes an
 * authenticated integration observable after a rollout.
 */
export async function verifyApiKeyFromRequest(
  request: Request
): Promise<ApiKeyRecord | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  // Trimmed because a stray newline from an integration's header config would
  // otherwise change the hash and read as an invalid key.
  const keyString = authHeader.slice(7).trim();
  if (!keyString) return null;

  try {
    const hashedKey = crypto.createHash("sha256").update(keyString).digest("hex");

    const [key] = await db
      .select({ id: apiKeys.id, name: apiKeys.name })
      .from(apiKeys)
      .where(eq(apiKeys.key, hashedKey))
      .limit(1);

    if (!key) return null;

    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(apiKeys.id, key.id));

    return key;
  } catch (error) {
    // Fail closed: a lookup failure must not be treated as a valid key.
    console.error("API key verification failed:", error);
    return null;
  }
}
