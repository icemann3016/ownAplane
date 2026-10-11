import { beforeAll, expect, it } from "vitest";

import { describeDb, prepareDatabase } from "./setup";

// Documents read by the AI (VER-9): logged without content, a daily limit per user, and no
// access for users.

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");
let usage: typeof import("@/lib/ocr/usage");

const PILOT = "d7d7d7d7-1111-4111-8111-111111111111";

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    return (e as { cause?: { code?: string } }).cause?.code;
  }
}

describeDb("documents read by the AI (VER-9)", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    usage = await import("@/lib/ocr/usage");
    await db
      .getDb()
      .insert(s.users)
      .values({ id: PILOT, name: "Reader", email: "reader@example.com" });
  }, 60_000);

  it("counts pages read in the last 24 hours against the daily limit", async () => {
    process.env.OCR_DAILY_LIMIT = "5";
    expect(await usage.readsLeft(PILOT)).toBe(5);
    await usage.logRead({ userId: PILOT, documentId: null, kind: "licence", outcome: "ok" });
    await usage.logRead({
      userId: PILOT,
      documentId: null,
      kind: "logbook",
      outcome: "unreadable",
      pages: 2,
    });
    expect(await usage.readsLeft(PILOT)).toBe(2);
    await db
      .getDb()
      .insert(s.documentReads)
      .values({
        userId: PILOT,
        kind: "medical",
        outcome: "ok",
        pages: 4,
        consentAt: new Date(),
        createdAt: new Date(Date.now() - 25 * 3_600_000),
      });
    expect(await usage.readsLeft(PILOT)).toBe(2);
    await usage.logRead({
      userId: PILOT,
      documentId: null,
      kind: "licence",
      outcome: "ok",
      pages: 9,
    });
    expect(await usage.readsLeft(PILOT)).toBe(0);
    delete process.env.OCR_DAILY_LIMIT;
    expect(usage.dailyReadLimit()).toBe(40);
  });

  it("shows admins reads per day and kind", async () => {
    const rows = await usage.readsLastWeek();
    expect(rows.find((r) => r.kind === "logbook")).toMatchObject({ reads: 1, pages: 2 });
  });

  it("keeps the log away from users", async () => {
    expect(await code(rls.asUser(PILOT, (tx) => tx.select().from(s.documentReads)))).toBe("42501");
    expect(
      await code(
        rls.asUser(PILOT, (tx) =>
          tx.insert(s.documentReads).values({ userId: PILOT, kind: "licence", outcome: "ok" }),
        ),
      ),
    ).toBe("42501");
  });
});
