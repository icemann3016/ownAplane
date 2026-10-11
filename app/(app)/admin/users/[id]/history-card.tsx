import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUtc } from "@/lib/aircraft/format";
import type { MemberDetail } from "@/lib/admin/member-detail";
import type { Locale } from "@/lib/i18n/config";

const KNOWN = [
  "suspend_user",
  "unsuspend_user",
  "grant_admin",
  "revoke_admin",
  "grant_plan",
  "revoke_plan",
  "give_credits",
] as const;
type Known = (typeof KNOWN)[number];

/** Open reports about the member or their aircraft, and admin actions on the account. */
export async function HistoryCard({ m }: { m: MemberDetail }) {
  const t = await getTranslations("admin.member");
  const tr = await getTranslations("reports.reasons");
  const locale = (await getLocale()) as Locale;
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle as="h2">{t("reports.title")}</CardTitle>
        <CardDescription>{t("reports.text")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 text-sm">
        {m.openReports.length === 0 ? (
          <p className="text-muted-foreground">{t("reports.none")}</p>
        ) : (
          <div className="grid gap-2">
            <ul className="grid gap-1">
              {m.openReports.map((r) => (
                <li key={r.id}>
                  {tr(r.reason)} ·{" "}
                  <span className="text-muted-foreground">{formatUtc(r.createdAt, locale)}</span>
                </li>
              ))}
            </ul>
            <Link href="/admin/reports" className="text-primary hover:underline">
              {t("reports.queue")}
            </Link>
          </div>
        )}
        <div className="grid gap-2">
          <h3 className="font-medium">{t("history.title")}</h3>
          {m.history.length === 0 ? (
            <p className="text-muted-foreground">{t("history.none")}</p>
          ) : (
            <ul className="grid gap-1.5">
              {m.history.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">
                    {KNOWN.includes(h.action as Known)
                      ? t(`history.actions.${h.action as Known}`)
                      : h.action}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {t("history.by", { name: h.adminName ?? t("history.formerAdmin") })} ·{" "}
                    {formatUtc(h.createdAt, locale)}
                  </span>
                  {h.reason && <p className="text-muted-foreground">“{h.reason}”</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
