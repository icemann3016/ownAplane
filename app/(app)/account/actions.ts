"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { pgError } from "@/lib/aircraft/manage";
import { getAuth } from "@/lib/auth/auth";
import { authErrorCode } from "@/lib/auth/errors";
import { isProviderEnabled, isSocialProvider } from "@/lib/auth/providers";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { asUser } from "@/lib/db/rls";
import { accounts, profiles, userRoles, userSettings } from "@/lib/db/schema";
import { formValues, type FormState, withoutSecrets } from "@/lib/forms";
import { localizedFieldErrors, setLocaleCookie } from "@/lib/i18n/server";
import { changePasswordSchema } from "@/lib/validation/auth";
import {
  deleteAccountSchema,
  preferencesSchema,
  profileSchema,
  selfServiceRoleSchema,
} from "@/lib/validation/profile";

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/account");
  const t = await getTranslations("account.profile");
  const raw = formValues(formData);
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };

  try {
    await asUser(user.id, (tx) =>
      tx
        .update(profiles)
        .set({
          displayName: parsed.data.displayName,
          homeAirportIdent: parsed.data.homeAirport,
          bio: parsed.data.bio,
        })
        .where(eq(profiles.id, user.id)),
    );
  } catch (error) {
    // 23503 = foreign key violation: the airport doesn't exist.
    if ((error as { cause?: { code?: string } }).cause?.code === "23503") {
      const v = await getTranslations("validation");
      return { errors: { homeAirport: [v("airportUnknown")] }, values: raw };
    }
    console.error("[account] profile update failed", error);
    return { message: t("saveFailed"), values: raw };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: t("saved"), values: raw };
}

export async function setRole(formData: FormData) {
  const user = await requireUser("/account");
  const role = selfServiceRoleSchema.parse(formData.get("role"));
  const enable = formData.get("enable") === "true";

  try {
    await asUser(user.id, async (tx) => {
      if (enable) {
        await tx.insert(userRoles).values({ userId: user.id, role }).onConflictDoNothing();
      } else {
        await tx
          .delete(userRoles)
          .where(and(eq(userRoles.userId, user.id), eq(userRoles.role, role)));
      }
    });
  } catch (e) {
    // Airfield accounts can't be pilots (the page shows why instead of the switch).
    if (!pgError(e).message?.includes("operator_not_pilot")) throw e;
  }
  revalidatePath("/", "layout");
}

export async function savePreferences(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/account");
  const raw = formValues(formData);
  const parsed = preferencesSchema.safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };

  await asUser(user.id, (tx) =>
    tx
      .update(userSettings)
      .set({ locale: parsed.data.locale, units: parsed.data.units })
      .where(eq(userSettings.userId, user.id)),
  );
  await setLocaleCookie(parsed.data.locale);
  revalidatePath("/", "layout");
  // Answer in the newly chosen language.
  const t = await getTranslations({ locale: parsed.data.locale, namespace: "account.preferences" });
  return { ok: true, message: t("saved"), values: raw };
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser("/account/password");
  const t = await getTranslations("password");
  const raw = formValues(formData);
  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: await localizedFieldErrors(parsed.error), values: withoutSecrets(raw) };
  }

  try {
    await getAuth().api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.password,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  } catch (error) {
    if (authErrorCode(error) === "INVALID_PASSWORD") {
      return { errors: { currentPassword: [t("wrongCurrent")] } };
    }
    console.error("[account] password change failed", error);
    return { message: t("failed") };
  }
  return { ok: true, message: t("changed") };
}

/** Permanently delete the account (GDPR). Profile, roles, settings and sessions cascade. */
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser("/account");
  const t = await getTranslations("account.data");
  const raw = formValues(formData);
  const parsed = deleteAccountSchema.safeParse(raw);
  const word = t("confirmWord");
  if (!parsed.success || parsed.data.confirm.toUpperCase() !== word.toUpperCase()) {
    return { errors: { confirm: [t("confirmMismatch", { word })] } };
  }

  try {
    await getAuth().api.deleteUser({
      body: parsed.data.password ? { password: parsed.data.password } : {},
      headers: await headers(),
    });
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "INVALID_PASSWORD") return { errors: { password: [t("wrongPassword")] } };
    if (code === "SESSION_EXPIRED" || code === "SESSION_NOT_FRESH")
      return { message: t("notFresh") };
    console.error("[account] delete failed", error);
    return { message: t("failed") };
  }

  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}

/** Connect Google/Apple/Facebook to the logged-in account (safe: the user has proven who they are). */
export async function linkProvider(formData: FormData) {
  await requireUser("/account");
  const provider = formData.get("provider");
  if (!isSocialProvider(provider) || !isProviderEnabled(provider)) redirect("/account");
  const { url } = await getAuth().api.linkSocialAccount({
    body: {
      provider,
      callbackURL: `/account?linked=${provider}`,
      errorCallbackURL: "/account",
    },
    headers: await headers(),
  });
  redirect(url);
}

/** Disconnect a provider (only offered while the user can still log in another way). */
export async function unlinkProvider(formData: FormData) {
  const user = await requireUser("/account");
  const provider = formData.get("provider");
  if (!isSocialProvider(provider)) return;
  try {
    const methods = await getDb()
      .select({ id: accounts.id, providerId: accounts.providerId })
      .from(accounts)
      .where(eq(accounts.userId, user.id));
    const target = methods.find((m) => m.providerId === provider);
    // Never remove the last way to log in.
    if (target && methods.length > 1) {
      await getAuth().api.unlinkAccount({
        body: { accountId: target.id }, // Better Auth's own row id, not the provider's
        headers: await headers(),
      });
    }
  } catch (error) {
    console.error(`[account] unlink ${provider} failed`, error);
  }
  revalidatePath("/account");
}
