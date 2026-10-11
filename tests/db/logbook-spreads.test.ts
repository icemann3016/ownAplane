import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { describeDb, prepareDatabase } from "./setup";

// Scanned logbook spreads (LOG-6): the pilot's own, of their own uploads; entries can only
// point to the pilot's own spreads; scans in a spread are kept by the clean-up.

let db: typeof import("@/lib/db");
let rls: typeof import("@/lib/db/rls");
let s: typeof import("@/lib/db/schema");
let documents: typeof import("@/lib/documents");

const PILOT = "e5e5e5e5-1111-4111-8111-1111111111e5";
const OTHER = "f6f6f6f6-2222-4222-8222-2222222222f6";
let pilotDoc: string;
let otherDoc: string;

async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    const err = e as { cause?: { code?: string; message?: string } };
    return err.cause?.code === "P0001" ? err.cause.message : err.cause?.code;
  }
}

describeDb("scanned logbook spreads (LOG-6)", () => {
  beforeAll(async () => {
    await prepareDatabase();
    db = await import("@/lib/db");
    rls = await import("@/lib/db/rls");
    s = await import("@/lib/db/schema");
    documents = await import("@/lib/documents");
    await db
      .getDb()
      .insert(s.users)
      .values([
        { id: PILOT, name: "Pilot", email: "spread-pilot@example.com" },
        { id: OTHER, name: "Other", email: "spread-other@example.com" },
      ]);
    const old = new Date(Date.now() - 3 * 86_400_000);
    const docs = await db
      .getDb()
      .insert(s.documents)
      .values([
        {
          ownerId: PILOT,
          storageKey: "documents/p/page.jpg",
          filename: "page.jpg",
          contentType: "image/jpeg",
          sizeBytes: 10,
          createdAt: old,
        },
        {
          ownerId: OTHER,
          storageKey: "documents/o/page.jpg",
          filename: "page.jpg",
          contentType: "image/jpeg",
          sizeBytes: 10,
          createdAt: old,
        },
      ])
      .returning();
    pilotDoc = docs[0]!.id;
    otherDoc = docs[1]!.id;
  }, 60_000);

  let spreadId: string;

  it("lets pilots keep spreads of their own uploads only", async () => {
    const [spread] = await rls.asUser(PILOT, (tx) =>
      tx.insert(s.logbookSpreads).values({ pilotId: PILOT, leftDocumentId: pilotDoc }).returning(),
    );
    spreadId = spread!.id;
    expect(
      await code(
        rls.asUser(PILOT, (tx) =>
          tx.insert(s.logbookSpreads).values({ pilotId: PILOT, leftDocumentId: otherDoc }),
        ),
      ),
    ).toBe("42501");
    const seen = (user: string) =>
      rls.asUser(user, (tx) =>
        tx.select().from(s.logbookSpreads).where(eq(s.logbookSpreads.id, spreadId)),
      );
    expect(await seen(PILOT)).toHaveLength(1);
    expect(await seen(OTHER)).toHaveLength(0);
  });

  it("links entries only to the pilot's own spreads", async () => {
    const entry = {
      kind: "fstd" as const,
      date: "2024-05-20",
      fstdType: "ALSIM",
      fstdMinutes: 120,
      source: "scan" as const,
      spreadId,
      spreadLine: 4,
    };
    await rls.asUser(PILOT, (tx) =>
      tx.insert(s.logbookEntries).values({ ...entry, pilotId: PILOT }),
    );
    expect(
      await code(
        rls.asUser(OTHER, (tx) => tx.insert(s.logbookEntries).values({ ...entry, pilotId: OTHER })),
      ),
    ).toBe("bad_spread");
  });

  it("keeps scans that belong to a spread when unused uploads are cleaned up", async () => {
    await documents.deleteOrphanDocuments(new Date(Date.now() - 86_400_000));
    const left = await db.getDb().select().from(s.documents);
    expect(left.map((d) => d.id)).toContain(pilotDoc);
    expect(left.map((d) => d.id)).not.toContain(otherDoc);
  });
});
