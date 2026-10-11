import "server-only";

import type { Done } from "@/lib/bookings/outcome";
import { saveExperience, saveTypeHours } from "@/lib/pilot/credential-ops";
import { getPilotCredentials } from "@/lib/pilot/credentials";
import { getTotals, type LogbookTotals } from "./entries";

// The pilot's experience (VER-4) from the certified logbook (LOG-7): total, PIC and last-90-days
// hours, and hours per ICAO type. Still self-declared, but now with the logbook behind it.

const hours = (minutes: number) => Math.round(minutes / 6) / 10;

export type LogbookExperience = {
  totalHours: number;
  picHours: number;
  last90DaysHours: number;
  types: { aircraftType: string; hours: number }[];
};

/** What the logbook says, or null without certified entries. Pure. */
export function experienceFromTotals(t: LogbookTotals): LogbookExperience | null {
  if (t.certified === 0) return null;
  const totalHours = hours(t.all.totalMinutes);
  const byType = new Map<string, number>();
  for (const r of t.byType) {
    // Only ICAO type designators (C172, PA28): "Cessna 172" can't be matched to a type.
    const code = r.aircraftType.toUpperCase().replace(/[\s-]+/g, "");
    if (/^[A-Z0-9]{2,6}$/.test(code)) byType.set(code, (byType.get(code) ?? 0) + r.minutes);
  }
  return {
    totalHours,
    picHours: Math.min(hours(t.all.picMinutes), totalHours),
    last90DaysHours: Math.min(hours(t.last90.totalMinutes), totalHours),
    types: [...byType.entries()].map(([aircraftType, m]) => ({ aircraftType, hours: hours(m) })),
  };
}

export async function getLogbookExperience(userId: string) {
  return experienceFromTotals(await getTotals(userId));
}

/** Replace the experience (keeping the date of birth) and type hours with the logbook's. */
export async function applyLogbookExperience(userId: string): Promise<Done> {
  const experience = await getLogbookExperience(userId);
  if (!experience) return { ok: false, error: "no_logbook" };
  const current = await getPilotCredentials(userId);
  await saveExperience(userId, {
    totalHours: experience.totalHours,
    picHours: experience.picHours,
    last90DaysHours: experience.last90DaysHours,
    birthDate: current.experience?.birthDate ?? null,
  });
  for (const t of experience.types) await saveTypeHours(userId, t.aircraftType, t.hours);
  return { ok: true };
}
