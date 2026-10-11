import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { PlusGate } from "@/components/billing/plus-gate";
import { getProfileAndRoles } from "@/lib/account/profile";
import { formatUtc } from "@/lib/aircraft/format";
import { requireUser } from "@/lib/auth/session";
import { getMyPlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/billing/plans";
import type { Locale } from "@/lib/i18n/config";
import { entriesInOrder } from "@/lib/logbook/entries";
import { paginate } from "@/lib/logbook/pages";
import { PageTable } from "./page-table";
import { PrintButton } from "./print-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("logbook.print");
  return { title: t("title") };
}

/** The logbook in the EASA layout (LOG-5), to print or save as PDF from the browser. */
export default async function PrintLogbookPage() {
  const user = await requireUser("/logbook/print");
  const t = await getTranslations("logbook");
  // The EASA print comes with Pilot Plus; the CSV export stays free (the data is the pilot's).
  if (!PLANS[(await getMyPlan(user.id)).plan].logbookExtras) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8">
        <PlusGate title={t("print.title")} text={t("print.planNeeded")} />
      </div>
    );
  }
  const locale = (await getLocale()) as Locale;
  const [entries, profile] = await Promise.all([
    entriesInOrder(user.id),
    getProfileAndRoles(user.id),
  ]);
  const { pages } = paginate(entries);
  return (
    <div className="grid w-full gap-4 px-4 py-6 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">{t("print.title")}</h1>
          <p className="text-sm">
            {t("print.pilot", { name: profile?.profile.displayName ?? "" })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("print.printed", { when: formatUtc(new Date(), locale) })}
          </p>
        </div>
        <PrintButton label={t("print.button")} />
      </div>
      <p className="text-xs text-muted-foreground">{t("print.note")}</p>
      {pages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("totals.none")}</p>
      ) : (
        <div className="grid gap-8 overflow-x-auto print:overflow-visible">
          {pages.map((page) => (
            <PageTable key={page.n} page={page} />
          ))}
        </div>
      )}
    </div>
  );
}
