import "server-only";

import { eq } from "drizzle-orm";

import { asUser } from "@/lib/db/rls";
import { type AppRole, profiles, userRoles, userSettings } from "@/lib/db/schema";

/** A user's own profile and roles (RLS), or null when the profile is missing. */
export async function getProfileAndRoles(userId: string) {
  return asUser(userId, async (tx) => {
    const [profile] = await tx.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return null;
    const roles = await tx
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return { profile, roles: roles.map((r) => r.role as AppRole) };
  });
}

/** A user's own settings (language, units, phone), with defaults when none were saved. */
export async function getOwnSettings(userId: string) {
  const [row] = await asUser(userId, (tx) =>
    tx
      .select({ locale: userSettings.locale, units: userSettings.units, phone: userSettings.phone })
      .from(userSettings)
      .where(eq(userSettings.userId, userId)),
  );
  return row ?? { locale: "en", units: "metric", phone: null };
}
