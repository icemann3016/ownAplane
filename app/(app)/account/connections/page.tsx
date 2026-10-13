import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlertIcon, CircleCheckIcon, KeyRoundIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { AccountTabs } from "@/components/account/account-tabs";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUtc } from "@/lib/aircraft/format";
import { requireUser } from "@/lib/auth/session";
import { feedErrorKey } from "@/lib/calendar-sync/feed-errors";
import { listPartnerAircraft } from "@/lib/calendar-sync/owner";
import { listPartnerCredentials } from "@/lib/calendar-sync/partner-credentials";
import { PARTNER_INFO, PARTNERS } from "@/lib/calendar-sync/partner-list";
import type { Locale } from "@/lib/i18n/config";
import { removePartnerKeyAction } from "./actions";
import { PartnerKeyForm, PartnerSyncNow } from "./partner-key-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.connections");
  return { title: t("title") };
}

/**
 * Connected services (SYN-7): the owner's API keys for partners. With a key, the partner's
 * bookings are put on the owner's aircraft with the same registration, without setup per aircraft.
 */
export default async function ConnectionsPage() {
  const user = await requireUser("/account/connections");
  const t = await getTranslations("account.connections");
  const reasons = await getTranslations("calendarSync.feedErrors");
  const locale = (await getLocale()) as Locale;
  const keys = new Map((await listPartnerCredentials(user.id)).map((k) => [k.partner, k]));
  const synced = await listPartnerAircraft(user.id);

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-10">
      <AccountTabs />
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      {PARTNERS.map((partner) => {
        const info = PARTNER_INFO[partner];
        const key = keys.get(partner);
        const planes = synced.filter((s) => s.partner === partner);
        return (
          <Card key={partner}>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <KeyRoundIcon className="size-5 text-primary" aria-hidden />
                {info.name}
              </CardTitle>
              <CardDescription>
                {t("partnerText", {
                  partner: info.name,
                  registrations: info.registrations.join(", "),
                })}{" "}
                <a href={info.site} className="underline" rel="noreferrer" target="_blank">
                  {info.site.replace(/^https:\/\//, "")}
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              {key ? (
                <div className="grid gap-1">
                  <p className="flex items-center gap-2 font-medium">
                    <CircleCheckIcon className="size-4 text-success" aria-hidden />
                    {t("connected", {
                      hint: key.hint,
                      date: formatUtc(key.updatedAt, locale, { dateOnly: true }),
                    })}
                  </p>
                  {key.lastError ? (
                    <p className="flex items-center gap-2 text-destructive">
                      <CircleAlertIcon className="size-4" aria-hidden />
                      {t("lastFailed", { reason: reasons(feedErrorKey(key.lastError)) })}
                    </p>
                  ) : (
                    key.lastUsedAt && (
                      <p className="text-muted-foreground">
                        {t("lastUsed", { when: formatUtc(key.lastUsedAt, locale) })}
                      </p>
                    )
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">{t("notConnected")}</p>
              )}
              {key && (
                <section className="grid gap-2" aria-labelledby={`aircraft-${partner}`}>
                  <h3 id={`aircraft-${partner}`} className="font-medium">
                    {t("aircraftTitle")}
                  </h3>
                  {planes.length ? (
                    <ul className="grid gap-1">
                      {planes.map((p) => (
                        <li key={p.aircraftId}>
                          <Link
                            href={`/owner/aircraft/${p.aircraftId}/calendar`}
                            className="font-medium underline"
                          >
                            {p.registration}
                          </Link>
                          {" · "}
                          {p.lastSyncError
                            ? t("aircraftFailed", {
                                reason: reasons(feedErrorKey(p.lastSyncError)),
                              })
                            : t("aircraftBusy", { count: p.lastSyncCount ?? 0 })}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">
                      {t("aircraftNone", { partner: info.name })}
                    </p>
                  )}
                  <PartnerSyncNow partner={partner} />
                </section>
              )}
              <p className="text-muted-foreground">{t("safe", { partner: info.name })}</p>
              <PartnerKeyForm partner={partner} hasKey={Boolean(key)} />
              {key && (
                <form action={removePartnerKeyAction} className="grid gap-1">
                  <input type="hidden" name="partner" value={partner} />
                  <SubmitButton variant="outline" size="sm" className="justify-self-start">
                    {t("remove")}
                  </SubmitButton>
                  <p className="text-muted-foreground">{t("removeText", { partner: info.name })}</p>
                </form>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
