import "server-only";

import { and, eq } from "drizzle-orm";

import { asUser } from "@/lib/db/rls";
import {
  airportClosures,
  airportFrequencies,
  airportHours,
  airportOperators,
  airportRunways,
  airportServices,
} from "@/lib/db/schema";
import type {
  ClosureInput,
  FrequencyInput,
  HoursInput,
  ProfileInput,
  RunwayInput,
  ServiceInput,
} from "@/lib/validation/airport-profile";

// Changes to an airfield's profile (APT-1), with the user's own rights: the database lets only
// the airfield's managers make them (RLS) and caps the rows per airfield.

export type ProfileResult = { ok: true } | { ok: false; error: "not_allowed" | "too_many_rows" };

const tooMany = (e: unknown) => {
  const err = e as { message?: string; cause?: { message?: string } };
  return (err.cause?.message ?? err.message ?? "").includes("too_many_rows");
};

/** Run a change; no row touched = not a manager (RLS hides the rest). */
async function change(run: () => Promise<unknown[]>): Promise<ProfileResult> {
  try {
    return (await run()).length ? { ok: true } : { ok: false, error: "not_allowed" };
  } catch (e) {
    if (tooMany(e)) return { ok: false, error: "too_many_rows" };
    if ((e as { cause?: { code?: string } }).cause?.code === "42501") {
      return { ok: false, error: "not_allowed" };
    }
    throw e;
  }
}

export function updateProfile(userId: string, ident: string, input: ProfileInput) {
  return change(() =>
    asUser(userId, (tx) =>
      tx
        .update(airportOperators)
        .set(input)
        .where(eq(airportOperators.airportIdent, ident))
        .returning({ ident: airportOperators.airportIdent }),
    ),
  );
}

/** Replace the weekly hours (and their note). */
export function setHours(userId: string, ident: string, input: HoursInput) {
  return change(() =>
    asUser(userId, async (tx) => {
      const updated = await tx
        .update(airportOperators)
        .set({ hoursNote: input.note })
        .where(eq(airportOperators.airportIdent, ident))
        .returning({ ident: airportOperators.airportIdent });
      if (!updated.length) return [];
      await tx.delete(airportHours).where(eq(airportHours.airportIdent, ident));
      if (input.hours.length) {
        await tx
          .insert(airportHours)
          .values(input.hours.map((h) => ({ ...h, airportIdent: ident })));
      }
      return updated;
    }),
  );
}

export function addClosure(userId: string, ident: string, input: ClosureInput) {
  return change(() =>
    asUser(userId, (tx) =>
      tx
        .insert(airportClosures)
        .values({ ...input, airportIdent: ident })
        .returning({ id: airportClosures.id }),
    ),
  );
}

export function addRunway(userId: string, ident: string, input: RunwayInput) {
  return change(() =>
    asUser(userId, (tx) =>
      tx
        .insert(airportRunways)
        .values({ ...input, airportIdent: ident })
        .returning({ id: airportRunways.id }),
    ),
  );
}

export function addFrequency(userId: string, ident: string, input: FrequencyInput) {
  return change(() =>
    asUser(userId, (tx) =>
      tx
        .insert(airportFrequencies)
        .values({ ...input, airportIdent: ident })
        .returning({ id: airportFrequencies.id }),
    ),
  );
}

export function addService(userId: string, ident: string, input: ServiceInput) {
  return change(() =>
    asUser(userId, (tx) =>
      tx
        .insert(airportServices)
        .values({ ...input, airportIdent: ident })
        .returning({ id: airportServices.id }),
    ),
  );
}

/** Change a service or its price. */
export function updateService(userId: string, ident: string, id: string, input: ServiceInput) {
  return change(() =>
    asUser(userId, (tx) =>
      tx
        .update(airportServices)
        .set(input)
        .where(and(eq(airportServices.id, id), eq(airportServices.airportIdent, ident)))
        .returning({ id: airportServices.id }),
    ),
  );
}

const TABLES = {
  closure: airportClosures,
  runway: airportRunways,
  frequency: airportFrequencies,
  service: airportServices,
} as const;
export type ProfileItem = keyof typeof TABLES;

/** Remove a closure, runway, frequency or service. */
export function removeItem(userId: string, ident: string, item: ProfileItem, id: string) {
  const table = TABLES[item];
  return change(() =>
    asUser(userId, (tx) =>
      tx
        .delete(table)
        .where(and(eq(table.id, id), eq(table.airportIdent, ident)))
        .returning({ id: table.id }),
    ),
  );
}
