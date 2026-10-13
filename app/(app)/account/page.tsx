import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlertIcon, CircleCheckIcon, DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AccountTabs } from "@/components/account/account-tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAirportAccount } from "@/lib/airport-teams/teams";
import { getAirport } from "@/lib/airports";
import { presetFromKey } from "@/lib/avatar-presets";
import { avatarUrl } from "@/lib/avatar-url";
import { enabledProviders, isSocialProvider, PROVIDER_NAMES } from "@/lib/auth/providers";
import { requireProfile } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { asUser } from "@/lib/db/rls";
import { accounts, userSettings } from "@/lib/db/schema";
import { AvatarUpload } from "./avatar-upload";
import { DeleteAccount } from "./delete-account";
import { ContactForm } from "./contact-form";
import { NotificationForm } from "./notification-form";
import { PreferencesForm } from "./preferences-form";
import { ProfileForm } from "./profile-form";
import { RolesForm } from "./roles-form";
import { SignInMethods } from "./sign-in-methods";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title") };
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; error?: string }>;
}) {
  const { linked, error } = await searchParams;
  const { userId, email, profile, roles } = await requireProfile("/account");
  const t = await getTranslations("account");

  const [settings] = await asUser(userId, (tx) =>
    tx.select().from(userSettings).where(eq(userSettings.userId, userId)),
  );
  // Accounts (login methods) are private auth data: read with the owner connection, own rows only.
  const methods = await getDb()
    .select({ providerId: accounts.providerId })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const hasPassword = methods.some((m) => m.providerId === "credential");
  const connected = methods.map((m) => m.providerId).filter(isSocialProvider);
  const homeAirport = await getAirport(profile.homeAirportIdent);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <AccountTabs />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/u/${userId}`}>
            {t("viewPublicProfile")} <ExternalLinkIcon />
          </Link>
        </Button>
      </div>

      {isSocialProvider(linked) && (
        <Alert variant="success">
          <CircleCheckIcon />
          <AlertDescription>
            {t("signIn.linked", { provider: PROVIDER_NAMES[linked] })}
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{t("signIn.linkFailed", { code: error })}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("profile.title")}</CardTitle>
          <CardDescription>{t("profile.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <AvatarUpload
            name={profile.displayName}
            url={avatarUrl(profile.avatarKey)}
            preset={presetFromKey(profile.avatarKey)}
          />
          <ProfileForm
            displayName={profile.displayName}
            homeAirport={homeAirport}
            bio={profile.bio ?? ""}
          />
        </CardContent>
      </Card>

      <Card id="roles">
        <CardHeader>
          <CardTitle as="h2">{t("roles.title")}</CardTitle>
          <CardDescription>{t("roles.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <RolesForm roles={roles} airportAccount={await isAirportAccount(userId)} />
        </CardContent>
      </Card>

      <Card id="notifications">
        <CardHeader>
          <CardTitle as="h2">{t("notifications.title")}</CardTitle>
          <CardDescription>{t("notifications.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationForm
            settings={{
              emailBookings: settings?.emailBookings ?? true,
              inAppBookings: settings?.inAppBookings ?? true,
              emailReviews: settings?.emailReviews ?? true,
              inAppReviews: settings?.inAppReviews ?? true,
              emailMessages: settings?.emailMessages ?? true,
            }}
          />
        </CardContent>
      </Card>
      <Card id="contact">
        <CardHeader>
          <CardTitle as="h2">{t("contact.title")}</CardTitle>
          <CardDescription>{t("contact.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ContactForm phone={settings?.phone ?? null} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("preferences.title")}</CardTitle>
          <CardDescription>{t("preferences.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm locale={settings?.locale ?? "en"} units={settings?.units ?? "metric"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("security.title")}</CardTitle>
          <CardDescription>{t("signIn.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SignInMethods
            hasPassword={hasPassword}
            connected={connected}
            enabled={enabledProviders()}
          />
          {hasPassword && (
            <Button variant="outline" className="justify-self-start" asChild>
              <Link href="/account/password">{t("security.changePassword")}</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("data.title")}</CardTitle>
          <CardDescription>{t("data.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <a href="/api/account/export" download>
              <DownloadIcon /> {t("data.download")}
            </a>
          </Button>
          <DeleteAccount hasPassword={hasPassword} />
        </CardContent>
      </Card>
    </div>
  );
}
