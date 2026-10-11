import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUtc } from "@/lib/aircraft/format";
import { isUuid } from "@/lib/aircraft/queries";
import { requireUser } from "@/lib/auth/session";
import type { Locale } from "@/lib/i18n/config";
import { getEntry } from "@/lib/logbook/entries";
import { deleteDraft } from "../actions";
import { EntryForm } from "../entry-form";
import { entryFormValues, entryLabel } from "../entry-label";
import { EntryDetails } from "./entry-details";
import { StrikeThrough } from "./strike-through";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("logbook");
  return { title: t("title") };
}

/** One entry: a draft to edit, or a certified one with its history (LOG-2). */
export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/logbook/${id}`);
  const found = isUuid(id) ? await getEntry(user.id, id) : null;
  if (!found) notFound();
  const { entry, history, correctedBy } = found;
  const t = await getTranslations("logbook");
  const locale = (await getLocale()) as Locale;
  const status = entry.status === "superseded" && entry.voidReason ? "voided" : entry.status;
  const label = entryLabel(entry, t(`kinds.${entry.kind}`));

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8">
      <Link href="/logbook" className="text-sm underline-offset-4 hover:underline">
        ← {t("detail.back")}
      </Link>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle
              as="h1"
              className={entry.status === "superseded" ? "line-through" : undefined}
            >
              {entry.status === "draft" ? t("entry.editTitle") : label}
            </CardTitle>
            <Badge variant={entry.status === "draft" ? "outline" : "secondary"}>
              {t(`status.${status}`)}
            </Badge>
          </div>
          {entry.source !== "manual" && (
            <CardDescription>{t(`source.${entry.source}`)}</CardDescription>
          )}
          {entry.certifiedAt && (
            <CardDescription>
              {t("detail.certifiedAt", { when: formatUtc(entry.certifiedAt, locale) })}
            </CardDescription>
          )}
          {entry.voidReason && (
            <CardDescription>{t("detail.voided", { reason: entry.voidReason })}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-6">
          {entry.status === "draft" ? (
            <>
              <EntryForm
                kind={entry.kind}
                values={entryFormValues(entry)}
                id={entry.id}
                corrects={entry.correctsId ?? undefined}
              />
              <form action={deleteDraft}>
                <input type="hidden" name="id" value={entry.id} />
                <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                  {t("entry.delete")}
                </Button>
              </form>
            </>
          ) : (
            <>
              <EntryDetails entry={entry} />
              {entry.status === "certified" && (
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/logbook/new?corrects=${entry.id}`}>{t("detail.correct")}</Link>
                  </Button>
                  <StrikeThrough id={entry.id} />
                </div>
              )}
            </>
          )}
          {correctedBy.length > 0 && (
            <section className="grid gap-1 text-sm">
              <h2 className="font-medium">{t("detail.correctedBy")}</h2>
              {correctedBy.map((c) => (
                <Link
                  key={c.id}
                  href={`/logbook/${c.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {entryLabel(c, t(`kinds.${c.kind}`))} · {t(`status.${c.status}`)}
                </Link>
              ))}
            </section>
          )}
          {history.length > 0 && (
            <section className="grid gap-1 text-sm">
              <h2 className="font-medium">{t("detail.history")}</h2>
              {history.map((h) => (
                <Link
                  key={h.id}
                  href={`/logbook/${h.id}`}
                  className="text-muted-foreground line-through underline-offset-4 hover:underline"
                >
                  {entryLabel(h, t(`kinds.${h.kind}`))}
                </Link>
              ))}
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
