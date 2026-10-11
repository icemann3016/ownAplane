import type { Metadata } from "next";
import Link from "next/link";
import {
  ChartColumnIcon,
  CheckCircle2Icon,
  DownloadIcon,
  GaugeIcon,
  PlusIcon,
  PrinterIcon,
  ScanLineIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getTotals, listDrafts, listEntries } from "@/lib/logbook/entries";
import { missingFields } from "@/lib/logbook/ops";
import { isOcrConfigured } from "@/lib/ocr";
import { CertifyForm } from "./certify-form";
import { EntriesTable } from "./entries-table";
import { entryLabel } from "./entry-label";
import { TotalsCard } from "./totals-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("logbook");
  return { title: t("title") };
}

/** The pilot's EASA logbook (LOG-1…5): totals, drafts to certify, entries. */
export default async function LogbookPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; certified?: string }>;
}) {
  const user = await requireUser("/logbook");
  const t = await getTranslations("logbook");
  const query = await searchParams;
  const page = Math.max(1, Math.min(10_000, Number(query.page) || 1));
  const certified = Number(query.certified);
  const [{ entries, hasMore }, drafts, totals] = await Promise.all([
    listEntries(user.id, page),
    listDrafts(user.id),
    getTotals(user.id),
  ]);

  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-4 py-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href="/logbook/new?kind=flight">
            <PlusIcon aria-hidden /> {t("add.flight")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/logbook/new?kind=fstd">{t("add.fstd")}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/logbook/new?kind=brought_forward">{t("add.brought_forward")}</Link>
        </Button>
        {isOcrConfigured() && (
          <Button asChild size="sm" variant="outline">
            <Link href="/logbook/scan">
              <ScanLineIcon aria-hidden /> {t("scan.link")}
            </Link>
          </Button>
        )}
        <Button asChild size="sm" variant="ghost">
          <Link href="/logbook/currency">
            <GaugeIcon aria-hidden /> {t("currency.link")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/logbook/stats">
            <ChartColumnIcon aria-hidden /> {t("stats.link")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/logbook/print">
            <PrinterIcon aria-hidden /> {t("printLink")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <a href="/logbook/export" download>
            <DownloadIcon aria-hidden /> {t("csv")}
          </a>
        </Button>
      </div>

      {Number.isInteger(certified) && certified > 0 && (
        <Alert role="status">
          <CheckCircle2Icon />
          <AlertDescription>{t("drafts.certified", { count: certified })}</AlertDescription>
        </Alert>
      )}

      <TotalsCard totals={totals} />

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
        <CardHeader>
          <CardTitle as="h2">{t("list.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 overflow-x-auto">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("list.empty")}</p>
          ) : (
            <EntriesTable entries={entries} />
          )}
          <nav className="flex gap-4 text-sm" aria-label={t("list.title")}>
            {page > 1 && <Link href={`/logbook?page=${page - 1}`}>{t("list.newer")}</Link>}
            {hasMore && <Link href={`/logbook?page=${page + 1}`}>{t("list.older")}</Link>}
          </nav>
        </CardContent>
      </Card>
    </div>
  );
}
