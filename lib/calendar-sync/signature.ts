import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Webhook signatures (SYN-6), like Stripe's: the header `ownaplane-signature: t=<unix
// seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>" with the connection's secret>`. Pure.

export const SIGNATURE_HEADER = "ownaplane-signature";

/** A new signing secret: 32 random bytes as hex. */
export const newWebhookSecret = () => randomBytes(32).toString("hex");

const hmac = (secret: string, t: number, body: string) =>
  createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

export function signWebhook(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${hmac(secret, t, body)}`;
}

/** What a receiver does (documented for partners): check the HMAC and that it is recent. */
export function verifyWebhook(
  secret: string,
  body: string,
  header: string,
  now = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=", 2) as [string, string]),
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1 || Math.abs(now - t) > toleranceSeconds) return false;
  const expected = Buffer.from(hmac(secret, t, body), "hex");
  const given = Buffer.from(parts.v1, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
