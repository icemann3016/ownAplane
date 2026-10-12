import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Secrets we must use again later (owners' API keys for partners, SYN-7), stored encrypted:
// AES-256-GCM with a key derived from BETTER_AUTH_SECRET (HKDF-SHA256, its own purpose label), so
// a database copy alone never reveals them. `context` (e.g. user and partner) is authenticated
// too: a value copied to another row doesn't decrypt. Rotating BETTER_AUTH_SECRET makes stored
// values unreadable; owners then enter them again.

const VERSION = "v1";
const PURPOSE = "ownaplane stored secrets v1";

function key(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", secret, "ownaplane", PURPOSE, 32));
}

export function encryptSecret(plain: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

/** The plain value, or null if it can't be read (another secret, context or a changed value). */
export function decryptSecret(stored: string, context: string): string | null {
  const [version, data] = stored.split(".");
  if (version !== VERSION || !data) return null;
  const raw = Buffer.from(data, "base64url");
  if (raw.length < 29) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
