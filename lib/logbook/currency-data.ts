import "server-only";

import { and, count, eq, ne } from "drizzle-orm";

import { asUser } from "@/lib/db/rls";
import { logbookEntries, pilotLicences, pilotRatings } from "@/lib/db/schema";
import { laplRecency, passengerRecency, sepRevalidation } from "./currency";

// The pilot's currency (Pilot Plus): passenger and night recency, SEP revalidation and LAPL
// recency from certified entries, with the SEP rating's expiry and the licences on file.

export async function getCurrency(userId: string, today = new Date().toISOString().slice(0, 10)) {
  const { entries, drafts, ratings, licences } = await asUser(userId, async (tx) => ({
    entries: await tx
      .select()
      .from(logbookEntries)
      .where(and(eq(logbookEntries.pilotId, userId), eq(logbookEntries.status, "certified"))),
    drafts: (
      await tx
        .select({ n: count() })
        .from(logbookEntries)
        .where(and(eq(logbookEntries.pilotId, userId), eq(logbookEntries.status, "draft")))
    )[0]?.n,
    ratings: await tx
      .select({
        kind: pilotRatings.kind,
        code: pilotRatings.code,
        expiresOn: pilotRatings.expiresOn,
      })
      .from(pilotRatings)
      .where(and(eq(pilotRatings.userId, userId), ne(pilotRatings.status, "rejected"))),
    licences: await tx
      .select({ type: pilotLicences.type })
      .from(pilotLicences)
      .where(and(eq(pilotLicences.userId, userId), ne(pilotLicences.status, "rejected"))),
  }));
  const sepExpiry =
    ratings
      .filter((r) => r.kind === "class" && r.code === "SEP_LAND" && r.expiresOn)
      .map((r) => r.expiresOn!)
      .sort()
      .at(-1) ?? null;
  const hasIr = ratings.some((r) => r.kind === "privilege" && r.code === "IR");
  const laplOnly =
    licences.some((l) => l.type === "lapl_a") &&
    !licences.some((l) => ["ppl_a", "cpl_a", "atpl_a", "mpl"].includes(l.type));
  return {
    today,
    drafts: drafts ?? 0,
    certified: entries.length,
    passengers: passengerRecency(entries, today),
    hasIr,
    sep: sepRevalidation(entries, sepExpiry, today),
    sepExpiry,
    lapl: laplOnly ? laplRecency(entries, today) : null,
  };
}

export type Currency = Awaited<ReturnType<typeof getCurrency>>;
