import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { RequestStatusBadge } from "@/components/airport-requests/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatUtc } from "@/lib/aircraft/format";
import { myAirportRequests } from "@/lib/airport-requests/queries";
import { requireUser } from "@/lib/auth/session";
import type { Locale } from "@/lib/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airportRequests.list");
  return { title: t("title") };
}

/** The pilot's requests to airfields (APT-2…5), the latest trip first. */
export default async function AirportRequestsPage() {
  const user = await requireUser("/airport-requests");
  const t = await getTranslations("airportRequests");
  const locale = (await getLocale()) as Locale;
  const requests = await myAirportRequests(user.id);
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("list.title")}</h1>
        <p className="text-muted-foreground">{t("list.description")}</p>
      </div>
      <Card>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("list.none")}{" "}
              <Link href="/airports" className="text-foreground underline underline-offset-4">
                {t("list.findAirfield")}
              </Link>
            </p>
          ) : (
            <ul className="grid divide-y">
              {requests.map((r) => {
                const code = r.airport.icaoCode ?? r.airport.ident;
                return (
                  <li key={r.id}>
                    <Link
                      href={`/airport-requests/${r.id}`}
                      className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-3 hover:bg-accent"
                    >
                      <span className="grid min-w-0 gap-0.5">
                        <span className="font-medium">
                          <span className="font-mono">{code}</span> {r.airport.name} ·{" "}
                          {r.registration}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {[
                            r.arrivalAt &&
                              t("list.arrives", { when: formatUtc(r.arrivalAt, locale) }),
                            r.departureAt &&
                              t("list.departs", { when: formatUtc(r.departureAt, locale) }),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="ml-auto">
                        <RequestStatusBadge request={r} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
