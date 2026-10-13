import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { asUser } from "@/lib/db/rls";
import {
  airportClaims,
  airportMembers,
  airportOperators,
  airports,
  userRoles,
} from "@/lib/db/schema";
import { sendClaimCode } from "./claim-code";
import { isWorkEmail } from "./proof";

// Claims to run an airfield (APT-1), filed and withdrawn by the person themselves (RLS). The
// email code is in claim-code.ts, the admin's decision in claim-review.ts.

const pgError = (e: unknown) => {
  const err = e as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  return { code: err.cause?.code ?? err.code, message: err.cause?.message ?? err.message };
};

export type ClaimInput = {
  airportIdent: string;
  position: string;
  note: string | null;
  proof: { documentId: string } | { email: string };
};

export type FileClaimResult =
  | { ok: true; id: string; status: "unconfirmed" | "pending"; codeSent: boolean }
  | {
      ok: false;
      error:
        | "airport_unknown"
        | "already_on_ownaplane"
        | "already_member"
        | "already_open"
        | "too_many_claims"
        | "free_email"
        | "pilot_account";
    };

/** File a claim; with an email address, its code is sent at once. */
export async function fileClaim(userId: string, input: ClaimInput): Promise<FileClaimResult> {
  const db = getDb();
  const [airport] = await db
    .select({ ident: airports.ident, operated: airportOperators.airportIdent })
    .from(airports)
    .leftJoin(airportOperators, eq(airportOperators.airportIdent, airports.ident))
    .where(eq(airports.ident, input.airportIdent));
  if (!airport) return { ok: false, error: "airport_unknown" };
  // Airfield accounts aren't pilot accounts (the database refuses it too).
  const [pilot] = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, "pilot")));
  if (pilot) return { ok: false, error: "pilot_account" };
  if (airport.operated) {
    const [member] = await asUser(userId, (tx) =>
      tx
        .select({ role: airportMembers.role })
        .from(airportMembers)
        .where(
          and(eq(airportMembers.airportIdent, airport.ident), eq(airportMembers.userId, userId)),
        ),
    );
    return { ok: false, error: member ? "already_member" : "already_on_ownaplane" };
  }
  if ("email" in input.proof && !isWorkEmail(input.proof.email)) {
    return { ok: false, error: "free_email" };
  }
  let row: { id: string; status: string } | undefined;
  try {
    [row] = await asUser(userId, (tx) =>
      tx
        .insert(airportClaims)
        .values({
          airportIdent: airport.ident,
          userId,
          position: input.position,
          note: input.note,
          ...("email" in input.proof
            ? { email: input.proof.email }
            : { documentId: input.proof.documentId }),
        })
        .returning({ id: airportClaims.id, status: airportClaims.status }),
    );
  } catch (e) {
    const { code, message } = pgError(e);
    if (code === "23505") return { ok: false, error: "already_open" };
    if (message?.includes("too_many_claims")) return { ok: false, error: "too_many_claims" };
    if (message?.includes("operator_not_pilot")) return { ok: false, error: "pilot_account" };
    throw e;
  }
  if (!row) throw new Error("claim not saved");
  const status = row.status === "unconfirmed" ? "unconfirmed" : "pending";
  const codeSent = status === "unconfirmed" && (await sendClaimCode(userId, row.id)).ok;
  return { ok: true, id: row.id, status, codeSent };
}

/** Withdraw an open claim (RLS: only one's own, only while open). */
export async function withdrawClaim(userId: string, claimId: string): Promise<boolean> {
  const done = await asUser(userId, (tx) =>
    tx
      .update(airportClaims)
      .set({ status: "withdrawn" })
      .where(
        and(
          eq(airportClaims.id, claimId),
          inArray(airportClaims.status, ["unconfirmed", "pending"]),
        ),
      )
      .returning({ id: airportClaims.id }),
  );
  return done.length > 0;
}

/** The user's claims, newest first (RLS). */
export async function listMyClaims(userId: string) {
  return asUser(userId, (tx) =>
    tx
      .select({
        id: airportClaims.id,
        status: airportClaims.status,
        position: airportClaims.position,
        email: airportClaims.email,
        hasDocument: sql<boolean>`${airportClaims.documentId} is not null`,
        decisionNote: airportClaims.decisionNote,
        createdAt: airportClaims.createdAt,
        decidedAt: airportClaims.decidedAt,
        airport: {
          ident: airports.ident,
          icaoCode: airports.icaoCode,
          name: airports.name,
          country: airports.country,
        },
      })
      .from(airportClaims)
      .innerJoin(airports, eq(airports.ident, airportClaims.airportIdent))
      .where(eq(airportClaims.userId, userId))
      .orderBy(desc(airportClaims.createdAt)),
  );
}

export type MyClaim = Awaited<ReturnType<typeof listMyClaims>>[number];
