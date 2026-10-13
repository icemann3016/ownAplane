import "server-only";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { asUser } from "@/lib/db/rls";
import { airportClaims, airports } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { airportClaimCodeEmail } from "@/lib/email/airport-templates";
import { getRecipient } from "@/lib/email/recipient";
import { appUrl } from "@/lib/site-url";
import { airportLabel, CODE_RESEND_MS, CODE_SENDS, CODE_TRIES, CODE_VALID_MS } from "./proof";

// The code that confirms the airport email address given as proof of a claim (APT-1). Trusted
// code: the claim is first read with the user's own rights, so it is theirs.

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

/** The user's own claim (RLS), with its airport. */
async function ownClaim(userId: string, claimId: string) {
  const [row] = await asUser(userId, (tx) =>
    tx
      .select({
        claim: airportClaims,
        airport: { ident: airports.ident, icaoCode: airports.icaoCode, name: airports.name },
      })
      .from(airportClaims)
      .innerJoin(airports, eq(airports.ident, airportClaims.airportIdent))
      .where(and(eq(airportClaims.id, claimId), eq(airportClaims.userId, userId))),
  );
  return row ?? null;
}

export type SendCodeResult =
  { ok: true } | { ok: false; error: "not_found" | "too_soon" | "too_many_codes" | "not_sent" };

/**
 * Send (again) the code to the claim's email address: at most once a minute and CODE_SENDS times
 * per claim, so the form can't be used to flood someone's inbox.
 */
export async function sendClaimCode(userId: string, claimId: string): Promise<SendCodeResult> {
  const found = await ownClaim(userId, claimId);
  const email = found?.claim.email;
  if (!found || found.claim.status !== "unconfirmed" || !email) {
    return { ok: false, error: "not_found" };
  }
  const { claim, airport } = found;
  if (claim.emailCodeSentAt && Date.now() - claim.emailCodeSentAt.getTime() < CODE_RESEND_MS) {
    return { ok: false, error: "too_soon" };
  }
  if (claim.emailCodesSent >= CODE_SENDS) return { ok: false, error: "too_many_codes" };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await getDb()
    .update(airportClaims)
    .set({
      emailCodeHash: hashCode(code),
      emailCodeSentAt: new Date(),
      emailCodeTries: 0,
      emailCodesSent: sql`${airportClaims.emailCodesSent} + 1`,
    })
    .where(eq(airportClaims.id, claim.id));
  const me = await getRecipient(userId);
  const sent = await sendEmail({
    to: email,
    ...airportClaimCodeEmail({
      name: me?.name ?? "",
      locale: me?.locale,
      airport: airportLabel(airport),
      code,
      url: `${appUrl()}/airports/manage`,
    }),
  }).catch(() => false);
  return sent ? { ok: true } : { ok: false, error: "not_sent" };
}

export type ConfirmCodeResult =
  { ok: true } | { ok: false; error: "not_found" | "wrong_code" | "expired" | "too_many_tries" };

/** Check the code from the email: the claim then waits for an admin. */
export async function confirmClaimCode(
  userId: string,
  claimId: string,
  code: string,
): Promise<ConfirmCodeResult> {
  const found = await ownClaim(userId, claimId);
  if (!found || found.claim.status !== "unconfirmed") return { ok: false, error: "not_found" };
  const { claim } = found;
  if (!claim.emailCodeHash || !claim.emailCodeSentAt) return { ok: false, error: "expired" };
  if (claim.emailCodeTries >= CODE_TRIES) return { ok: false, error: "too_many_tries" };
  if (Date.now() - claim.emailCodeSentAt.getTime() > CODE_VALID_MS) {
    return { ok: false, error: "expired" };
  }
  const given = Buffer.from(hashCode(code.replace(/\s/g, "")));
  const right = given.length === 64 && timingSafeEqual(given, Buffer.from(claim.emailCodeHash));
  const db = getDb();
  if (!right) {
    await db
      .update(airportClaims)
      .set({ emailCodeTries: sql`${airportClaims.emailCodeTries} + 1` })
      .where(eq(airportClaims.id, claim.id));
    return { ok: false, error: "wrong_code" };
  }
  await db
    .update(airportClaims)
    .set({ status: "pending", emailConfirmedAt: new Date(), emailCodeHash: null })
    .where(and(eq(airportClaims.id, claim.id), eq(airportClaims.status, "unconfirmed")));
  return { ok: true };
}
