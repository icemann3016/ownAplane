import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { ApiUsageRow } from "@/lib/admin/api-usage";
import type { Locale } from "@/lib/i18n/config";

/** Requests per app user and connected system, today and over 7 days (UTC). */
export async function UsageTable({ rows, locale }: { rows: ApiUsageRow[]; locale: Locale }) {
  const t = await getTranslations("admin.api.usage");
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">{t("title")}</caption>
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="py-2 pr-3 font-medium">
            {t("caller")}
          </th>
          <th scope="col" className="py-2 pr-3 font-medium">
            {t("type")}
          </th>
          <th scope="col" className="py-2 pr-3 text-right font-medium">
            {t("today")}
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            {t("week")}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r) => (
          <tr key={`${r.type}:${r.id}`} className="align-top">
            <td className="py-2 pr-3">
              <Link
                href={r.type === "user" ? `/admin/users/${r.id}` : `/aircraft/${r.aircraftId}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {r.name ?? t("deleted")}
              </Link>
              {r.detail && <div className="text-xs text-muted-foreground">{r.detail}</div>}
            </td>
            <td className="py-2 pr-3">{t(r.type)}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{r.today.toLocaleString(locale)}</td>
            <td className="py-2 text-right tabular-nums">{r.week.toLocaleString(locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
