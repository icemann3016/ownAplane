import { getTranslations } from "next-intl/server";

import type { readsLastWeek } from "@/lib/ocr/usage";

type Row = Awaited<ReturnType<typeof readsLastWeek>>[number];

/** Scans read with the AI per UTC day and kind (VER-9, LOG-6): each page is a paid call. */
export async function ReadsTable({ rows, limit }: { rows: Row[]; limit: number }) {
  const t = await getTranslations("admin.api.reads");
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">{t("limit", { count: limit })}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 pr-3 font-medium">
                {t("day")}
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                {t("kind")}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t("reads")}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t("pages")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={`${r.day}:${r.kind}`}>
                <td className="py-2 pr-3 whitespace-nowrap">{r.day}</td>
                <td className="py-2 pr-3">{t(`kinds.${r.kind}` as "kinds.licence")}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.reads}</td>
                <td className="py-2 text-right tabular-nums">{r.pages}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
