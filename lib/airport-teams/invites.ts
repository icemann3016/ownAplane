import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { asUser } from "@/lib/db/rls";
import { airportInvites, airportMembers, airports, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { airportInviteEmail } from "@/lib/email/airport-templates";
import { getRecipient } from "@/lib/email/recipient";
import { appUrl } from "@/lib/site-url";
import { airportLabel } from "./proof";
import { airportColumns, type MemberRole } from "./teams";

// Invitations to an airfield's team (APT-1): managers send them (RLS); the link carries a
// secret token, stored hashed, and joining goes through accept_airport_invite().

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const pgMessage = (e: unknown) => {
  const err = e as { message?: string; cause?: { message?: string } };
  return err.cause?.message ?? err.message ?? "";
};

export type InviteResult =
  | { ok: true; link: string; emailed: boolean }
  | { ok: false; error: "not_allowed" | "already_member" | "too_many_invites" };

/**
 * A manager invites someone by email. The link (with a secret token, stored hashed) is emailed
 * and also returned once, so the manager can pass it on if the email doesn't arrive.
 */
export async function inviteMember(
  userId: string,
  ident: string,
  email: string,
  role: MemberRole,
): Promise<InviteResult> {
  const address = email.trim().toLowerCase();
  // Trusted read: is that address already on the team? (Members' emails aren't visible to RLS.)
  const [already] = await getDb()
    .select({ userId: airportMembers.userId })
    .from(airportMembers)
    .innerJoin(users, eq(users.id, airportMembers.userId))
    .where(and(eq(airportMembers.airportIdent, ident), sql`lower(${users.email}) = ${address}`));
  const token = randomBytes(32).toString("hex");
  let airport: { ident: string; icaoCode: string | null; name: string } | undefined;
  try {
    airport = await asUser(userId, async (tx) => {
      const [row] = await tx
        .select({ ident: airports.ident, icaoCode: airports.icaoCode, name: airports.name })
        .from(airportMembers)
        .innerJoin(airports, eq(airports.ident, airportMembers.airportIdent))
        .where(
          and(
            eq(airportMembers.airportIdent, ident),
            eq(airportMembers.userId, userId),
            eq(airportMembers.role, "manager"),
          ),
        );
      if (!row || already) return row;
      await tx
        .insert(airportInvites)
        .values({ airportIdent: ident, email: address, role, tokenHash: hashToken(token) });
      return row;
    });
  } catch (e) {
    if (pgMessage(e).includes("too_many_invites")) return { ok: false, error: "too_many_invites" };
    throw e;
  }
  if (!airport) return { ok: false, error: "not_allowed" };
  if (already) return { ok: false, error: "already_member" };

  const link = `${appUrl()}/airports/invite/${token}`;
  const inviter = await getRecipient(userId);
  const emailed = await sendEmail({
    to: address,
    ...airportInviteEmail({
      locale: inviter?.locale,
      airport: airportLabel(airport),
      inviter: inviter?.name ?? "",
      url: link,
    }),
  }).catch(() => false);
  return { ok: true, link, emailed };
}

/** A manager cancels an open invitation (RLS). */
export async function cancelInvite(userId: string, ident: string, inviteId: string) {
  await asUser(userId, (tx) =>
    tx
      .delete(airportInvites)
      .where(and(eq(airportInvites.id, inviteId), eq(airportInvites.airportIdent, ident))),
  );
}

/** What an invitation link is for, to show before joining (trusted read by its token). */
export async function inviteByToken(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const [row] = await getDb()
    .select({
      email: airportInvites.email,
      role: airportInvites.role,
      expiresAt: airportInvites.expiresAt,
      acceptedAt: airportInvites.acceptedAt,
      airport: airportColumns,
    })
    .from(airportInvites)
    .innerJoin(airports, eq(airports.ident, airportInvites.airportIdent))
    .where(eq(airportInvites.tokenHash, hashToken(token)));
  return row ?? null;
}

export type AcceptResult =
  { ok: true; ident: string } | { ok: false; error: "invite_invalid" | "invite_other_email" };

/** Join the team with an invitation's token: only as the invited email address. */
export async function acceptInvite(userId: string, token: string): Promise<AcceptResult> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, error: "invite_invalid" };
  try {
    const [row] = (await asUser(userId, (tx) =>
      tx.execute(sql`select public.accept_airport_invite(${hashToken(token)}) as ident`),
    )) as unknown as { ident: string }[];
    return { ok: true, ident: row!.ident };
  } catch (e) {
    const message = pgMessage(e);
    if (message.includes("invite_other_email")) return { ok: false, error: "invite_other_email" };
    if (message.includes("invite_invalid")) return { ok: false, error: "invite_invalid" };
    throw e;
  }
}
