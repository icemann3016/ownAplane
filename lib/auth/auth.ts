import "server-only";

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins/bearer";

import { getDb, schema } from "@/lib/db";
import { deleteUserFiles } from "@/lib/account/delete-files";
import { sendEmail } from "@/lib/email";
import { resetPasswordEmail, verifyEmailEmail } from "@/lib/email/templates";
import { siteConfig } from "@/lib/site";
import { appUrl } from "@/lib/site-url";
import { isProviderEnabled, PROVIDER_HOSTS, socialProviderOptions } from "./providers";

/** The user's chosen language, for emails. */
async function userLocale(userId: string): Promise<string | undefined> {
  const [row] = await getDb()
    .select({ locale: schema.userSettings.locale })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  return row?.locale;
}

/**
 * Origin our mobile apps send with sign-in and sign-out requests (API-2). Browsers can't send a
 * custom-scheme origin, so trusting it doesn't weaken the website's CSRF protection.
 */
export const APP_ORIGIN = "ownaplane://";

/**
 * Other addresses allowed to use login (besides BETTER_AUTH_URL): BETTER_AUTH_TRUSTED_ORIGINS,
 * our apps' origin and, on Vercel, the project's own *.vercel.app addresses.
 */
function trustedOrigins(): string[] {
  const vercel = [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]
    .filter(Boolean)
    .map((host) => `https://${host}`);
  const extra = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  // Apple returns to us with a form POST from its own site.
  const apple = isProviderEnabled("apple") ? [PROVIDER_HOSTS.apple] : [];
  return [...new Set([...extra, ...vercel, ...apple, APP_ORIGIN])];
}

function createAuth() {
  return betterAuth({
    appName: siteConfig.name,
    baseURL: appUrl(),
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        rateLimit: schema.rateLimits,
      },
    }),
    advanced: {
      cookiePrefix: "app",
      database: { generateId: "uuid" },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 72,
      // Switch on once a real email service is configured (EMAIL_DRIVER=smtp).
      requireEmailVerification: process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true",
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const locale = await userLocale(user.id);
        await sendEmail({
          to: user.email,
          ...resetPasswordEmail({ name: user.name, url, locale }),
        });
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const locale = await userLocale(user.id);
        await sendEmail({ to: user.email, ...verifyEmailEmail({ name: user.name, url, locale }) });
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        // Profile, settings, roles and sessions are removed by the database (ON DELETE CASCADE);
        // files in storage have to be removed here.
        beforeDelete: (user) => deleteUserFiles(user.id),
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Suspended users can't log in (ADM-2); their sessions are deleted when suspended.
          before: async (session) => {
            const [profile] = await getDb()
              .select({ suspendedAt: schema.profiles.suspendedAt })
              .from(schema.profiles)
              .where(eq(schema.profiles.id, session.userId));
            if (profile?.suspendedAt) {
              throw APIError.from("FORBIDDEN", {
                message: "This account is suspended.",
                code: "ACCOUNT_SUSPENDED",
              });
            }
          },
        },
      },
    },
    // Google, Apple and Facebook, each only when its keys are set (lib/auth/providers.ts).
    socialProviders: socialProviderOptions(),
    rateLimit: {
      // Stored in Postgres so limits hold across several server instances.
      storage: "database",
    },
    plugins: [
      // Apps sign in with a token (API-2): sign-in answers carry it in `set-auth-token`, and
      // `Authorization: Bearer <token>` counts as the session. Only signed tokens are accepted.
      bearer({ requireSignature: true }),
      nextCookies(), // keep last: lets Server Actions set the session cookie
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { auth?: Auth; authCreatedAt?: number };

/** Rebuilt now and then so a long-running server never uses an expired Apple client secret. */
const AUTH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** The Better Auth instance (created on first use, so builds work without a database). */
export function getAuth(): Auth {
  const now = Date.now();
  if (!globalForAuth.auth || now - (globalForAuth.authCreatedAt ?? 0) > AUTH_MAX_AGE_MS) {
    globalForAuth.auth = createAuth();
    globalForAuth.authCreatedAt = now;
  }
  return globalForAuth.auth;
}
