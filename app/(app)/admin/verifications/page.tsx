import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, InboxIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAircraftQueue } from "@/lib/admin/aircraft";
import { getVerificationQueue } from "@/lib/admin/verifications";
import { getClaimQueue } from "@/lib/airport-teams/claim-review";
import { requireAdmin } from "@/lib/auth/session";
import { intlLocale } from "@/lib/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.verifications");
  return { title: t("title") };
}

export default async function VerificationQueuePage() {
  const { userId } = await requireAdmin("/admin/verifications");
  const t = await getTranslations("admin.verifications");
  const queue = await getVerificationQueue(userId);
  const aircraftQueue = await getAircraftQueue(userId);
  const claimQueue = await getClaimQueue();
  const format = new Intl.DateTimeFormat(intlLocale(await getLocale()), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <div className="grid gap-1">
        <p className="text-sm font-medium text-primary">{t("eyebrow")}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("waiting", { count: queue.length })}</CardTitle>
          <CardDescription>{t("oldestFirst")}</CardDescription>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <InboxIcon className="size-4" aria-hidden /> {t("empty")}
            </p>
          ) : (
            <ul className="grid divide-y">
              {queue.map((entry) => (
                <li key={entry.userId}>
                  <Link
                    href={`/admin/verifications/${entry.userId}`}
                    className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-accent"
                  >
                    <div className="grid min-w-0 gap-0.5">
                      <span className="truncate font-medium">{entry.displayName}</span>
                      <span className="text-sm text-muted-foreground">
                        {t("items", { count: entry.items })} ·{" "}
                        {t("since", { date: `${format.format(entry.since)} UTC` })}
                      </span>
                    </div>
                    <ChevronRightIcon className="ml-auto size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("aircraftWaiting", { count: aircraftQueue.length })}</CardTitle>
          <CardDescription>{t("aircraftText")}</CardDescription>
        </CardHeader>
        <CardContent>
          {aircraftQueue.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <InboxIcon className="size-4" aria-hidden /> {t("empty")}
            </p>
          ) : (
            <ul className="grid divide-y">
              {aircraftQueue.map((entry) => (
                <li key={entry.aircraftId}>
                  <Link
                    href={`/admin/verifications/aircraft/${entry.aircraftId}`}
                    className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-accent"
                  >
                    <div className="grid min-w-0 gap-0.5">
                      <span className="truncate font-medium">
                        <span className="font-mono">{entry.registration}</span> · {entry.ownerName}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {t("items", { count: entry.items })} ·{" "}
                        {t("since", { date: `${format.format(entry.since)} UTC` })}
                      </span>
                    </div>
                    <ChevronRightIcon className="ml-auto size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("airportsWaiting", { count: claimQueue.length })}</CardTitle>
          <CardDescription>{t("airportsText")}</CardDescription>
        </CardHeader>
        <CardContent>
          {claimQueue.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <InboxIcon className="size-4" aria-hidden /> {t("empty")}
            </p>
          ) : (
            <ul className="grid divide-y">
              {claimQueue.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/admin/verifications/airports/${entry.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-accent"
                  >
                    <div className="grid min-w-0 gap-0.5">
                      <span className="truncate font-medium">
                        <span className="font-mono">
                          {entry.airport.icaoCode ?? entry.airport.ident}
                        </span>{" "}
                        {entry.airport.name} · {entry.claimant}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {t("since", { date: `${format.format(entry.createdAt)} UTC` })}
                      </span>
                    </div>
                    <ChevronRightIcon className="ml-auto size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
