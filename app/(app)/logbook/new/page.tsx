import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isUuid } from "@/lib/aircraft/queries";
import { getProfileAndRoles } from "@/lib/account/profile";
import { requireUser } from "@/lib/auth/session";
import { getEntry } from "@/lib/logbook/entries";
import { LOGBOOK_KINDS } from "@/lib/validation/logbook";
import { EntryForm } from "../entry-form";
import { entryFormValues } from "../entry-label";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("logbook");
  return { title: t("title") };
}

type Kind = (typeof LOGBOOK_KINDS)[number];

/** A new entry (?kind=flight|fstd|brought_forward), or a correction (?corrects=<id>). */
export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; corrects?: string }>;
}) {
  const user = await requireUser("/logbook/new");
  const t = await getTranslations("logbook");
  const { kind: wanted, corrects } = await searchParams;
  const original = corrects && isUuid(corrects) ? await getEntry(user.id, corrects) : null;
  if (corrects && original?.entry.status !== "certified") notFound();
  const kind: Kind = original
    ? original.entry.kind
    : (LOGBOOK_KINDS as readonly string[]).includes(wanted ?? "")
      ? (wanted as Kind)
      : "flight";
  const today = new Date().toISOString().slice(0, 10);
  const name = (await getProfileAndRoles(user.id))?.profile.displayName ?? "";
  const values = original
    ? entryFormValues(original.entry)
    : { date: today, ...(kind === "flight" ? { picName: name } : {}) };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle as="h1">
            {original ? t("entry.correctTitle") : t(`entry.newTitle.${kind}`)}
          </CardTitle>
          {original && <CardDescription>{t("entry.correctNote")}</CardDescription>}
          {kind === "brought_forward" && !original && (
            <CardDescription>{t("entry.broughtForwardNote")}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <EntryForm kind={kind} values={values} corrects={original?.entry.id} />
        </CardContent>
      </Card>
    </div>
  );
}
