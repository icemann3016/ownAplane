import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUsage, limitedCallers } from "@/lib/admin/api-usage";
import { LIMITS } from "@/lib/api/rate-limit";
import { requireAdmin } from "@/lib/auth/session";
import type { Locale } from "@/lib/i18n/config";
import { AdminHeader } from "../page-header";
import { LimitedTable } from "./limited-table";
import { UsageTable } from "./usage-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.api");
  return { title: t("title") };
}

/** API requests per app user and connected system, and who hit the limits (API-6). */
export default async function ApiUsagePage() {
  await requireAdmin("/admin/api");
  const t = await getTranslations("admin.api");
  const locale = (await getLocale()) as Locale;
  const [usage, limited] = await Promise.all([apiUsage(), limitedCallers()]);
  const n = (value: number) => value.toLocaleString(locale);

  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-4 py-8">
      <AdminHeader title={t("title")} text={t("description")} />
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("limits.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 text-sm">
            <li>{t("limits.user", { count: n(LIMITS.user) })}</li>
            <li>{t("limits.partner", { count: n(LIMITS.partner) })}</li>
            <li>{t("limits.anonymous", { count: n(LIMITS.anonymous) })}</li>
            <li>{t("limits.badTokens", { count: n(LIMITS.badTokens) })}</li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("limited.title")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <LimitedTable rows={limited} locale={locale} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("usage.title")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <UsageTable rows={usage} locale={locale} />
        </CardContent>
      </Card>
    </div>
  );
}
