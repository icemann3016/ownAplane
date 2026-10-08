import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProfileAndRoles } from "@/lib/account/profile";
import { getAuth } from "@/lib/auth/auth";
import { isDatabaseConfigured } from "@/lib/db";
import type { AppRole, Profile } from "@/lib/db/schema";

export type CurrentProfile = {
  userId: string;
  email: string;
  profile: Profile;
  roles: AppRole[];
};

/** The logged-in user's session, or null. Cached for the duration of one request. */
export const getSession = cache(async () => {
  // Session-dependent: always render per request.
  await connection();
  if (!isDatabaseConfigured()) return null;
  return getAuth().api.getSession({ headers: await headers() });
});

export const getUser = cache(async () => (await getSession())?.user ?? null);

/** The logged-in user's profile and roles, or null. Cached per request. */
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const user = await getUser();
  if (!user) return null;

  const found = await getProfileAndRoles(user.id);
  return found ? { userId: user.id, email: user.email, ...found } : null;
});

function loginUrl(nextPath?: string) {
  return nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
}

/** Use at the top of pages and Server Actions that need a logged-in user. */
export async function requireUser(nextPath?: string) {
  const user = await getUser();
  if (!user) redirect(loginUrl(nextPath));
  return user;
}

export async function requireProfile(nextPath?: string) {
  const current = await getCurrentProfile();
  if (!current) redirect(loginUrl(nextPath));
  return current;
}

/**
 * Admin pages and actions. Non-admins get a 404, so the admin area isn't advertised.
 * Admins are granted with `npm run admin:grant -- email@example.com`.
 */
export async function requireAdmin(nextPath = "/admin/verifications") {
  const current = await requireProfile(nextPath);
  if (!current.roles.includes("admin")) notFound();
  return current;
}
