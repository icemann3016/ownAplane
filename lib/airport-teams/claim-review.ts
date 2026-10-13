import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  adminActions,
  airportClaims,
  airportMembers,
  airportOperators,
  airports,
  documents,
  profiles,
  users,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { airportClaimReviewedEmail } from "@/lib/email/airport-templates";
import { getRecipient } from "@/lib/email/recipient";
import { appUrl } from "@/lib/site-url";
import { airportLabel } from "./proof";

// Admins decide airport claims (APT-1). Trusted code: callers checked requireAdmin().

/** Claims waiting for an admin, oldest first. */
export async function getClaimQueue() {
  return getDb()
    .select({
      id: airportClaims.id,
      createdAt: airportClaims.createdAt,
      claimant: profiles.displayName,
      airport: { ident: airports.ident, icaoCode: airports.icaoCode, name: airports.name },
    })
    .from(airportClaims)
    .innerJoin(airports, eq(airports.ident, airportClaims.airportIdent))
    .innerJoin(profiles, eq(profiles.id, airportClaims.userId))
    .where(eq(airportClaims.status, "pending"))
    .orderBy(asc(airportClaims.createdAt))
    .limit(200);
}

/** A claim with what the admin needs to judge it. */
export async function getClaimForReview(id: string) {
  const [row] = await getDb()
    .select({
      claim: airportClaims,
      claimant: { id: users.id, name: profiles.displayName, email: users.email },
      airport: {
        ident: airports.ident,
        icaoCode: airports.icaoCode,
        name: airports.name,
        municipality: airports.municipality,
        country: airports.country,
      },
      document: { id: documents.id, filename: documents.filename },
      operated: airportOperators.airportIdent,
    })
    .from(airportClaims)
    .innerJoin(airports, eq(airports.ident, airportClaims.airportIdent))
    .innerJoin(users, eq(users.id, airportClaims.userId))
    .innerJoin(profiles, eq(profiles.id, airportClaims.userId))
    .leftJoin(documents, eq(documents.id, airportClaims.documentId))
    .leftJoin(airportOperators, eq(airportOperators.airportIdent, airportClaims.airportIdent))
    .where(eq(airportClaims.id, id));
  return row ?? null;
}

export type ClaimDecisionResult =
  { ok: true; airportIdent: string } | { ok: false; error: "notFound" | "ownItem" | "changed" };

/**
 * Verify or reject a pending claim. Verifying puts the airfield on ownAplane (if it isn't yet)
 * and makes the claimant a manager of its team. Logged in admin_actions; the claimant is emailed.
 * `version` is the updated_at the admin saw.
 */
export async function decideClaim({
  adminId,
  id,
  version,
  decision,
  reason,
}: {
  adminId: string;
  id: string;
  version: string;
  decision: "verify" | "reject";
  reason: string | null;
}): Promise<ClaimDecisionResult> {
  const found = await getClaimForReview(id);
  if (!found || found.claim.status !== "pending") return { ok: false, error: "notFound" };
  if (found.claim.userId === adminId) return { ok: false, error: "ownItem" };
  const { claim, airport } = found;

  const done = await getDb().transaction(async (tx) => {
    const updated = await tx
      .update(airportClaims)
      .set({
        status: decision === "verify" ? "verified" : "rejected",
        decidedBy: adminId,
        decidedAt: new Date(),
        decisionNote: decision === "reject" ? reason : null,
      })
      .where(
        and(
          eq(airportClaims.id, id),
          eq(airportClaims.status, "pending"),
          sql`date_trunc('milliseconds', ${airportClaims.updatedAt}) = ${version}::timestamptz`,
        ),
      )
      .returning({ id: airportClaims.id });
    if (!updated.length) return false;
    if (decision === "verify") {
      await tx
        .insert(airportOperators)
        .values({ airportIdent: claim.airportIdent, verifiedBy: adminId })
        .onConflictDoNothing();
      await tx
        .insert(airportMembers)
        .values({
          airportIdent: claim.airportIdent,
          userId: claim.userId,
          role: "manager",
          addedBy: adminId,
        })
        .onConflictDoUpdate({
          target: [airportMembers.airportIdent, airportMembers.userId],
          set: { role: "manager" },
        });
    }
    await tx.insert(adminActions).values({
      adminId,
      action: `airport_claim.${decision}`,
      targetType: "airport_claim",
      targetId: id,
      reason: decision === "reject" ? reason : null,
    });
    return true;
  });
  if (!done) return { ok: false, error: "changed" };

  try {
    const to = await getRecipient(claim.userId);
    if (to) {
      await sendEmail({
        to: to.email,
        ...airportClaimReviewedEmail({
          name: to.name,
          locale: to.locale,
          airport: airportLabel(airport),
          decision,
          reason,
          url: `${appUrl()}/airports/manage`,
        }),
      });
    }
  } catch (e) {
    // The decision is saved either way; the claimant also sees it under Airports.
    console.error("[airports] couldn't email the claimant", e);
  }
  return { ok: true, airportIdent: claim.airportIdent };
}
