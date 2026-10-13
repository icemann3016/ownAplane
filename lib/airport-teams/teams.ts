import "server-only";

import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { cache } from "react";

import { asUser } from "@/lib/db/rls";
import {
  airportInvites,
  airportMembers,
  airportOperators,
  airports,
  profiles,
} from "@/lib/db/schema";

// Airport teams (APT-1): who runs an airfield on ownAplane. Reads and changes go through the
// user's own rights (RLS: members see their team, managers change it). Invitations are in
// invites.ts.

export type MemberRole = "manager" | "staff";

const pgMessage = (e: unknown) => {
  const err = e as { message?: string; cause?: { message?: string } };
  return err.cause?.message ?? err.message ?? "";
};

export const airportColumns = {
  ident: airports.ident,
  icaoCode: airports.icaoCode,
  name: airports.name,
  municipality: airports.municipality,
  country: airports.country,
};

/** The user's role on an airfield's team, with the airfield; null when not on it. Per request. */
export const myAirportRole = cache(async (userId: string, ident: string) => {
  const [row] = await asUser(userId, (tx) =>
    tx
      .select({
        role: airportMembers.role,
        verifiedAt: airportOperators.verifiedAt,
        airport: airportColumns,
      })
      .from(airportMembers)
      .innerJoin(airportOperators, eq(airportOperators.airportIdent, airportMembers.airportIdent))
      .innerJoin(airports, eq(airports.ident, airportMembers.airportIdent))
      .where(and(eq(airportMembers.airportIdent, ident), eq(airportMembers.userId, userId))),
  );
  return row ?? null;
});

/** The airfields the user is on the team of, with their role. */
export async function myAirports(userId: string) {
  return asUser(userId, (tx) =>
    tx
      .select({ role: airportMembers.role, airport: airportColumns })
      .from(airportMembers)
      .innerJoin(airports, eq(airports.ident, airportMembers.airportIdent))
      .where(eq(airportMembers.userId, userId))
      .orderBy(asc(airports.name)),
  );
}

/** An airfield's team as its member sees it; null when the user isn't on it. */
export async function getTeam(userId: string, ident: string) {
  return asUser(userId, async (tx) => {
    const [airport] = await tx
      .select({ ...airportColumns, verifiedAt: airportOperators.verifiedAt })
      .from(airportOperators)
      .innerJoin(airports, eq(airports.ident, airportOperators.airportIdent))
      .where(eq(airportOperators.airportIdent, ident));
    if (!airport) return null;
    const members = await tx
      .select({
        userId: airportMembers.userId,
        role: airportMembers.role,
        since: airportMembers.createdAt,
        name: profiles.displayName,
      })
      .from(airportMembers)
      .innerJoin(profiles, eq(profiles.id, airportMembers.userId))
      .where(eq(airportMembers.airportIdent, ident))
      .orderBy(asc(airportMembers.role), asc(profiles.displayName));
    const me = members.find((m) => m.userId === userId);
    if (!me) return null;
    // RLS shows invitations to managers only.
    const invites = await tx
      .select({
        id: airportInvites.id,
        email: airportInvites.email,
        role: airportInvites.role,
        expiresAt: airportInvites.expiresAt,
      })
      .from(airportInvites)
      .where(
        and(
          eq(airportInvites.airportIdent, ident),
          isNull(airportInvites.acceptedAt),
          gt(airportInvites.expiresAt, sql`now()`),
        ),
      )
      .orderBy(asc(airportInvites.createdAt));
    return { airport, members, invites, role: me.role };
  });
}

export type Team = NonNullable<Awaited<ReturnType<typeof getTeam>>>;

export type TeamChangeResult = { ok: true } | { ok: false; error: "last_manager" | "not_allowed" };

/** A manager changes someone's role (RLS: managers only; a team keeps a manager). */
export async function setMemberRole(
  userId: string,
  ident: string,
  memberId: string,
  role: MemberRole,
): Promise<TeamChangeResult> {
  try {
    const done = await asUser(userId, (tx) =>
      tx
        .update(airportMembers)
        .set({ role })
        .where(and(eq(airportMembers.airportIdent, ident), eq(airportMembers.userId, memberId)))
        .returning({ userId: airportMembers.userId }),
    );
    return done.length ? { ok: true } : { ok: false, error: "not_allowed" };
  } catch (e) {
    if (pgMessage(e).includes("last_manager")) return { ok: false, error: "last_manager" };
    throw e;
  }
}

/** A manager removes someone, or a member leaves (themselves). */
export async function removeMember(
  userId: string,
  ident: string,
  memberId: string,
): Promise<TeamChangeResult> {
  try {
    const done = await asUser(userId, (tx) =>
      tx
        .delete(airportMembers)
        .where(and(eq(airportMembers.airportIdent, ident), eq(airportMembers.userId, memberId)))
        .returning({ userId: airportMembers.userId }),
    );
    return done.length ? { ok: true } : { ok: false, error: "not_allowed" };
  } catch (e) {
    if (pgMessage(e).includes("last_manager")) return { ok: false, error: "last_manager" };
    throw e;
  }
}
