import Link from "next/link";
import { BellIcon, BellOffIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUtc } from "@/lib/aircraft/format";
import type { SavedSearch } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/config";
import { changeSearchAlerts, removeSavedSearch } from "./actions";

/** Saved searches: open, switch alerts on or off, remove (SRC-6). */
export async function SearchesCard({ searches }: { searches: SavedSearch[] }) {
  const t = await getTranslations("saved.searches");
  const locale = (await getLocale()) as Locale;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("text")}</p>
      </CardHeader>
      <CardContent>
        {searches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="grid divide-y">
            {searches.map((s) => (
              <li key={s.id} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                <div className="grid min-w-0 gap-0.5 text-sm">
                  <span className="font-medium break-words">{s.name}</span>
                  <span className="text-muted-foreground">
                    {s.alerts
                      ? s.lastAlertAt
                        ? t("lastAlert", { when: formatUtc(s.lastAlertAt, locale) })
                        : t("alertsOn")
                      : t("alertsOff")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/search${s.query ? `?${s.query}` : ""}`}>
                      <SearchIcon aria-hidden /> {t("open")}
                    </Link>
                  </Button>
                  <form action={changeSearchAlerts}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="alerts" value={s.alerts ? "0" : "1"} />
                    <SubmitButton variant="ghost" size="sm">
                      {s.alerts ? <BellOffIcon aria-hidden /> : <BellIcon aria-hidden />}
                      {s.alerts ? t("turnOff") : t("turnOn")}
                    </SubmitButton>
                  </form>
                  <form action={removeSavedSearch} className="ml-auto">
                    <input type="hidden" name="id" value={s.id} />
                    <SubmitButton
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      aria-label={t("remove", { name: s.name })}
                    >
                      <Trash2Icon aria-hidden />
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
