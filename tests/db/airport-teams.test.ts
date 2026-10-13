import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, prepareDatabase } from "./setup";

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");
let claims: typeof import("@/lib/airport-teams/claims");
let teams: typeof import("@/lib/airport-teams/teams");
let code: typeof import("@/lib/airport-teams/claim-code");
let review: typeof import("@/lib/airport-teams/claim-review");
let invites: typeof import("@/lib/airport-teams/invites");

const CLAIMANT = "a1a1a1a1-1111-4111-8111-111111111111";
const STAFF = "b2b2b2b2-2222-4222-8222-222222222222";
const OTHER = "c3c3c3c3-3333-4333-8333-333333333333";
const ADMIN = "d4d4d4d4-4444-4444-8444-444444444444";
const AIRPORT = "LBSF";

async function pgError(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    const err = e as {
      code?: string;
      message?: string;
      cause?: { code?: string; message?: string };
    };
    return err.cause?.message ?? err.message;
  }
}

describeDb("airport teams and claims (APT-1)", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    claims = await import("@/lib/airport-teams/claims");
    teams = await import("@/lib/airport-teams/teams");
    code = await import("@/lib/airport-teams/claim-code");
    review = await import("@/lib/airport-teams/claim-review");
    invites = await import("@/lib/airport-teams/invites");
    const owner = db.getDb();
    await owner.insert(s.users).values([
      { id: CLAIMANT, name: "Claire Claimant", email: "claire@sofia-airport.example" },
      { id: STAFF, name: "Stan Staff", email: "stan@sofia-airport.example" },
      { id: OTHER, name: "Olga Other", email: "olga@example.com" },
      { id: ADMIN, name: "Ada Admin", email: "ada@ownaplane.example" },
    ]);
    await owner.insert(s.userRoles).values({ userId: ADMIN, role: "admin" });
    await owner.insert(s.airports).values(
      ["LBSF", "LBPD"].map((ident) => ({
        ident,
        type: "large_airport",
        name: ident === "LBSF" ? "Sofia" : "Plovdiv",
        icaoCode: ident,
        country: "BG",
        latitude: 42.69,
        longitude: 23.41,
        timezone: "Europe/Sofia",
      })),
    );
  }, 60_000);

  const docOf = async (userId: string) => {
    const [doc] = await db
      .getDb()
      .insert(s.documents)
      .values({
        ownerId: userId,
        storageKey: `test/${userId}/${Math.random()}`,
        filename: "letter.pdf",
        contentType: "application/pdf",
        sizeBytes: 100,
      })
      .returning();
    return doc!.id;
  };

  it("files claims with one's own document or a work email, never someone else's", async () => {
    const othersDoc = await docOf(OTHER);
    // A claim proven with another person's document is refused by the database.
    expect(
      await pgError(
        rls.asUser(CLAIMANT, (tx) =>
          tx.insert(s.airportClaims).values({
            airportIdent: AIRPORT,
            userId: CLAIMANT,
            position: "Manager",
            documentId: othersDoc,
          }),
        ),
      ),
    ).toMatch(/row-level security/);
    // Nor can it be filed for someone else, or be marked verified by its author.
    expect(
      await pgError(
        rls.asUser(CLAIMANT, (tx) =>
          tx.insert(s.airportClaims).values({
            airportIdent: AIRPORT,
            userId: OTHER,
            position: "Manager",
            email: "x@sofia-airport.example",
          }),
        ),
      ),
    ).toMatch(/row-level security/);

    expect(
      await claims.fileClaim(CLAIMANT, {
        airportIdent: AIRPORT,
        position: "Duty officer",
        note: null,
        proof: { email: "me@gmail.com" },
      }),
    ).toEqual({ ok: false, error: "free_email" });
    const filed = await claims.fileClaim(CLAIMANT, {
      airportIdent: AIRPORT,
      position: "Duty officer",
      note: null,
      proof: { email: "Claire@Sofia-Airport.example" },
    });
    expect(filed).toMatchObject({ ok: true, status: "unconfirmed" });
    expect(
      await claims.fileClaim(CLAIMANT, {
        airportIdent: AIRPORT,
        position: "Duty officer",
        note: null,
        proof: { documentId: await docOf(CLAIMANT) },
      }),
    ).toEqual({ ok: false, error: "already_open" });
    expect(
      await claims.fileClaim(CLAIMANT, {
        airportIdent: "NOPE",
        position: "Duty officer",
        note: null,
        proof: { documentId: await docOf(CLAIMANT) },
      }),
    ).toEqual({ ok: false, error: "airport_unknown" });

    // Only the claimant (and admins) see it; the email is stored in lower case.
    const id = filed.ok ? filed.id : "";
    expect(await rls.asUser(OTHER, (tx) => tx.select().from(s.airportClaims))).toEqual([]);
    const mine = await claims.listMyClaims(CLAIMANT);
    expect(mine).toMatchObject([{ id, email: "claire@sofia-airport.example" }]);
    // Its author can't decide it.
    const decided = await rls
      .asUser(CLAIMANT, (tx) =>
        tx
          .update(s.airportClaims)
          .set({ status: "verified" })
          .where(eq(s.airportClaims.id, id))
          .returning(),
      )
      .catch(() => "refused");
    expect(decided).toBe("refused");
  });

  it("confirms the airport email with its code, a few tries only", async () => {
    const [claim] = await claims.listMyClaims(CLAIMANT);
    const id = claim!.id;
    const setCode = (code: string, sentAgoMs = 0) =>
      db
        .getDb()
        .update(s.airportClaims)
        .set({
          emailCodeHash: createHash("sha256").update(code).digest("hex"),
          emailCodeSentAt: new Date(Date.now() - sentAgoMs),
          emailCodeTries: 0,
        })
        .where(eq(s.airportClaims.id, id));

    await setCode("123456", 31 * 60 * 1000);
    expect(await code.confirmClaimCode(CLAIMANT, id, "123456")).toEqual({
      ok: false,
      error: "expired",
    });
    await setCode("123456");
    expect(await code.confirmClaimCode(OTHER, id, "123456")).toEqual({
      ok: false,
      error: "not_found",
    });
    for (let i = 0; i < 5; i++) {
      expect(await code.confirmClaimCode(CLAIMANT, id, "000000")).toEqual({
        ok: false,
        error: "wrong_code",
      });
    }
    expect(await code.confirmClaimCode(CLAIMANT, id, "123456")).toEqual({
      ok: false,
      error: "too_many_tries",
    });
    // New codes: not within a minute of the last one, and at most 5 per claim.
    expect(await code.sendClaimCode(CLAIMANT, id)).toEqual({ ok: false, error: "too_soon" });
    await db
      .getDb()
      .update(s.airportClaims)
      .set({ emailCodeSentAt: new Date(Date.now() - 120_000), emailCodesSent: 5 })
      .where(eq(s.airportClaims.id, id));
    expect(await code.sendClaimCode(CLAIMANT, id)).toEqual({
      ok: false,
      error: "too_many_codes",
    });
    await setCode("123456");
    expect(await code.confirmClaimCode(CLAIMANT, id, "123 456")).toEqual({ ok: true });
    expect((await claims.listMyClaims(CLAIMANT))[0]!.status).toBe("pending");
  });

  it("lets an admin verify a claim: the airfield gets a team with the claimant as manager", async () => {
    const queue = await review.getClaimQueue();
    expect(queue.map((q) => q.airport.ident)).toEqual([AIRPORT]);
    const found = await review.getClaimForReview(queue[0]!.id);
    const version = found!.claim.updatedAt.toISOString();
    // Nobody reviews their own claim; a stale page is refused.
    expect(
      await review.decideClaim({
        adminId: CLAIMANT,
        id: found!.claim.id,
        version,
        decision: "verify",
        reason: null,
      }),
    ).toEqual({ ok: false, error: "ownItem" });
    expect(
      await review.decideClaim({
        adminId: ADMIN,
        id: found!.claim.id,
        version: new Date(0).toISOString(),
        decision: "verify",
        reason: null,
      }),
    ).toEqual({ ok: false, error: "changed" });
    expect(
      await review.decideClaim({
        adminId: ADMIN,
        id: found!.claim.id,
        version,
        decision: "verify",
        reason: null,
      }),
    ).toEqual({ ok: true, airportIdent: AIRPORT });

    // Everyone may see which airfields are on ownAplane.
    expect(await rls.asAnon((tx) => tx.select().from(s.airportOperators))).toMatchObject([
      { airportIdent: AIRPORT, verifiedBy: ADMIN },
    ]);
    expect(await teams.myAirports(CLAIMANT)).toMatchObject([
      { role: "manager", airport: { ident: AIRPORT } },
    ]);
    const [logged] = await db
      .getDb()
      .select()
      .from(s.adminActions)
      .where(eq(s.adminActions.targetId, found!.claim.id));
    expect(logged).toMatchObject({ adminId: ADMIN, action: "airport_claim.verify" });

    // A claimed airfield takes no new claims: its managers invite people.
    expect(
      await claims.fileClaim(OTHER, {
        airportIdent: AIRPORT,
        position: "Manager",
        note: null,
        proof: { documentId: await docOf(OTHER) },
      }),
    ).toEqual({ ok: false, error: "already_on_ownaplane" });
  });

  it("lets managers invite people, only the invited address joins, once", async () => {
    // Only managers invite.
    expect(await invites.inviteMember(OTHER, AIRPORT, "x@example.com", "staff")).toEqual({
      ok: false,
      error: "not_allowed",
    });
    const invite = await invites.inviteMember(
      CLAIMANT,
      AIRPORT,
      "Stan@Sofia-Airport.example",
      "staff",
    );
    expect(invite).toMatchObject({ ok: true });
    const token = invite.ok ? invite.link.split("/").pop()! : "";
    expect(
      await invites.inviteMember(CLAIMANT, AIRPORT, "claire@sofia-airport.example", "staff"),
    ).toEqual({ ok: false, error: "already_member" });
    // The token is stored hashed; staff and outsiders don't see invitations.
    const [stored] = await db.getDb().select().from(s.airportInvites);
    expect(stored!.tokenHash).not.toBe(token);
    expect(stored!.email).toBe("stan@sofia-airport.example");
    expect(await rls.asUser(OTHER, (tx) => tx.select().from(s.airportInvites))).toEqual([]);

    expect(await invites.acceptInvite(OTHER, token)).toEqual({
      ok: false,
      error: "invite_other_email",
    });
    expect(await invites.acceptInvite(STAFF, "0".repeat(64))).toEqual({
      ok: false,
      error: "invite_invalid",
    });
    expect(await invites.acceptInvite(STAFF, token)).toEqual({ ok: true, ident: AIRPORT });
    expect(await invites.acceptInvite(STAFF, token)).toEqual({
      ok: false,
      error: "invite_invalid",
    });

    const team = await teams.getTeam(STAFF, AIRPORT);
    expect(team?.role).toBe("staff");
    expect(team?.members.map((m) => [m.name, m.role])).toEqual([
      ["Claire Claimant", "manager"],
      ["Stan Staff", "staff"],
    ]);
    expect(team?.invites).toEqual([]);
    // Outsiders see no team.
    expect(await teams.getTeam(OTHER, AIRPORT)).toBeNull();
    expect(await rls.asUser(OTHER, (tx) => tx.select().from(s.airportMembers))).toEqual([]);
  });

  it("lets managers change the team, keeps a manager, and lets people leave", async () => {
    // Staff can't change roles or remove people.
    expect(await teams.setMemberRole(STAFF, AIRPORT, STAFF, "manager")).toEqual({
      ok: false,
      error: "not_allowed",
    });
    expect(await teams.removeMember(STAFF, AIRPORT, CLAIMANT)).toEqual({
      ok: false,
      error: "not_allowed",
    });
    // The only manager can't step down or leave.
    expect(await teams.setMemberRole(CLAIMANT, AIRPORT, CLAIMANT, "staff")).toEqual({
      ok: false,
      error: "last_manager",
    });
    expect(await teams.removeMember(CLAIMANT, AIRPORT, CLAIMANT)).toEqual({
      ok: false,
      error: "last_manager",
    });
    expect(await teams.setMemberRole(CLAIMANT, AIRPORT, STAFF, "manager")).toEqual({ ok: true });
    expect(await teams.setMemberRole(CLAIMANT, AIRPORT, CLAIMANT, "staff")).toEqual({ ok: true });
    // Anyone may leave.
    expect(await teams.removeMember(CLAIMANT, AIRPORT, CLAIMANT)).toEqual({ ok: true });
    expect(await teams.myAirports(CLAIMANT)).toEqual([]);

    // Trusted code (deleting an account) may leave a team without a manager.
    await db.getDb().delete(s.users).where(eq(s.users.id, STAFF));
    const left = await db
      .getDb()
      .select()
      .from(s.airportMembers)
      .where(and(eq(s.airportMembers.airportIdent, AIRPORT)));
    expect(left).toEqual([]);
  });

  it("lets people withdraw their open claims only", async () => {
    const filed = await claims.fileClaim(OTHER, {
      airportIdent: "LBPD",
      position: "Manager",
      note: "Ops desk",
      proof: { documentId: await docOf(OTHER) },
    });
    expect(filed).toMatchObject({ ok: true, status: "pending" });
    const id = filed.ok ? filed.id : "";
    expect(await claims.withdrawClaim(CLAIMANT, id)).toBe(false);
    expect(await claims.withdrawClaim(OTHER, id)).toBe(true);
    expect(await claims.withdrawClaim(OTHER, id)).toBe(false);
    const [row] = await db
      .getDb()
      .select({ status: s.airportClaims.status })
      .from(s.airportClaims)
      .where(eq(s.airportClaims.id, id));
    expect(row?.status).toBe("withdrawn");
    // Claim documents aren't cleaned up as unused.
    const { deleteOrphanDocuments } = await import("@/lib/documents");
    await deleteOrphanDocuments(new Date(Date.now() + 60_000));
    const [kept] = (await db.getDb().execute(sql`
      select count(*)::int as n from public.documents d
      join public.airport_claims c on c.document_id = d.id`)) as unknown as { n: number }[];
    expect(kept!.n).toBeGreaterThan(0);
  });
});
