import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { formatUtc } from "@/lib/aircraft/format";
import type { LimitedCaller } from "@/lib/admin/api-usage";
import type { Locale } from "@/lib/i18n/config";

/** Callers over their limit in the last hour. */
export async function LimitedTable({ rows, locale }: { rows: LimitedCaller[]; locale: Locale }) {
  const t = await getTranslations("admin.api.limited");
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">{t("title")}</caption>
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="py-2 pr-3 font-medium">
            {t("caller")}
          </th>
          <th scope="col" className="py-2 pr-3 text-right font-medium">
            {t("minutes")}
          </th>
          <th scope="col" className="py-2 pr-3 text-right font-medium">
            {t("peak")}
          </th>
          <th scope="col" className="py-2 font-medium">
            {t("last")}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r, i) => (
          <tr key={i} className="align-top">
            <td className="py-2 pr-3">
              <div className="text-xs text-muted-foreground">{t(`kinds.${r.kind}`)}</div>
              <Caller row={r} unknown={t("unknown")} />
            </td>
            <td className="py-2 pr-3 text-right tabular-nums">{r.minutes}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{r.peak.toLocaleString(locale)}</td>
            <td className="py-2 whitespace-nowrap">{formatUtc(r.last, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Caller({ row, unknown }: { row: LimitedCaller; unknown: string }) {
  const link = "font-medium underline-offset-4 hover:underline";
  if (row.address) return <span className="font-mono text-xs break-all">{row.address}</span>;
  if (row.userId) {
    return (
      <Link href={`/admin/users/${row.userId}`} className={link}>
        {row.name}
      </Link>
    );
  }
  if (row.aircraftId) {
    return (
      <Link href={`/aircraft/${row.aircraftId}`} className={link}>
        {row.name}
      </Link>
    );
  }
  return <span>{unknown}</span>;
}
