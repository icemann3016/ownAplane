import { createHash, randomBytes } from "node:crypto";

// API keys of push connections (SYN-4): shown to the owner once, stored as a SHA-256 hash.

export const API_KEY_PREFIX = "oap_";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** A new key (`oap_` + 43 random characters), its hash and a short hint to recognise it. */
export function newApiKey() {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashApiKey(key), hint: key.slice(-4) };
}
