import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileTextIcon, TriangleAlertIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isUuid } from "@/lib/aircraft/queries";
import { requireUser } from "@/lib/auth/session";
import { formatDuration } from "@/lib/logbook/duration";
import { missingFields } from "@/lib/logbook/ops";
import { getSpread } from "@/lib/ocr/logbook-read";
import { CertifyForm } from "../../certify-form";
import { EntriesTable } from "../../entries-table";
import { entryLabel, TOTAL_LABEL } from "../../entry-label";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("logbook.scan");
  return { title: t("resultTitle") };
}

/** What was read from a spread: the totals check, and its lines as drafts to certify (LOG-6). */
export default async function SpreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/logbook/scan/${id}`);
  const found = isUuid(id) ? await getSpread(user.id, id) : null;
  if (!found || found.spread.pilotId !== user.id) notFound();
  const { spread, entries } = found;
  const t = await getTranslations("logbook");
  const value = (column: string, n: number) =>
    column.startsWith("landings") ? String(n) : formatDuration(n);
  const label = (column: string) =>
    (TOTAL_LABEL[column] ?? ["total"]).map((k) => t(`columns.${k}` as "columns.total")).join(" ");
  const drafts = entries.filter((e) => e.status === "draft");

  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-4 py-8">
      <Link href="/logbook" className="text-sm underline-offset-4 hover:underline">
        ← {t("detail.back")}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle as="h1">{t("scan.resultTitle")}</CardTitle>
          <CardDescription>
            {t("scan.linesRead", { count: spread.linesRead })}{" "}
            {spread.linesSkipped > 0 && t("scan.linesSkipped", { count: spread.linesSkipped })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {spread.differences.length > 0 ? (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertDescription>
                <p>{t("scan.totalsDiffer")}</p>
                <ul className="list-disc pl-5">
                  {spread.differences.map((d) => (
                    <li key={d.column}>
                      {t("scan.difference", {
                        column: label(d.column),
                        written: value(d.column, d.written),
                        lines: value(d.column, d.lines),
                      })}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm">
              {spread.pageTotals ? t("scan.totalsMatch") : t("scan.totalsNotRead")}
            </p>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            {[
              [spread.leftDocumentId, t("scan.leftPage")],
              [spread.rightDocumentId, t("scan.rightPage")],
            ]
              .filter(([doc]) => doc)
              .map(([doc, name]) => (
                <a
                  key={doc}
                  href={`/api/documents/${doc}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  <FileTextIcon className="size-4" aria-hidden /> {name}
                </a>
              ))}
            <Link href="/logbook/scan" className="underline-offset-4 hover:underline">
              {t("scan.another")}
            </Link>
          </div>
        </CardContent>
      </Card>
      {drafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("drafts.title")}</CardTitle>
            <CardDescription>{t("drafts.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <CertifyForm
              drafts={drafts.map((d) => ({
                id: d.id,
                label: entryLabel(d, t(`kinds.${d.kind}`)),
                source: d.source,
                missing: missingFields(d),
              }))}
            />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <EntriesTable entries={entries} />
        </CardContent>
      </Card>
    </div>
  );
}
