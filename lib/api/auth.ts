import "server-only";

import { getAuth } from "@/lib/auth/auth";
import { isDatabaseConfigured } from "@/lib/db";
import { ApiError } from "./http";

// API sign-in (API-2): only `Authorization: Bearer <token>`, never cookies, so a website visitor's
// browser can't be tricked into calling the API (no CSRF). Tokens come from the Better Auth
// sign-in endpoints (`set-auth-token` response header, bearer plugin) and are revoked by
// signing out, "sign out everywhere", a password change or suspension.

export type ApiUser = { id: string; email: string; emailVerified: boolean };

const BEARER = /^bearer\s+\S+$/i;

/** The signed-in user, null without an Authorization header, 401 for a bad or expired token. */
export async function optionalApiUser(request: Request): Promise<ApiUser | null> {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return null;
  if (!BEARER.test(authorization)) {
    throw new ApiError("unauthorized", "Send the token as: Authorization: Bearer <token>.");
  }
  if (!isDatabaseConfigured()) throw new ApiError("unauthorized", "Sign-in isn't available.");
  // Only the Authorization header is passed on: cookies are ignored on purpose.
  const session = await getAuth().api.getSession({ headers: new Headers({ authorization }) });
  if (!session) throw new ApiError("unauthorized", "The token is invalid or has expired.");
  const { id, email, emailVerified } = session.user;
  return { id, email, emailVerified };
}

/** The signed-in user, or 401. */
export async function requireApiUser(request: Request): Promise<ApiUser> {
  const user = await optionalApiUser(request);
  if (!user) {
    throw new ApiError(
      "unauthorized",
      "Sign in first and send the token as: Authorization: Bearer <token>.",
    );
  }
  return user;
}
