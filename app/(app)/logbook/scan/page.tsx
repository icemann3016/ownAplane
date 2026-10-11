import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditsNote } from "@/components/billing/credits-note";
import { requireUser } from "@/lib/auth/session";
import { isOcrConfigured } from "@/lib/ocr";
import { ScanForm } from "./scan-form";

// Reading a spread with the AI (actions.ts) can take a while.
export const maxDuration = 60;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("logbook.scan");
  return { title: t("title") };
}

/** Read a scanned two-page spread of a paper logbook into drafts (LOG-6). */
export default async function ScanPage() {
  const user = await requireUser("/logbook/scan");
  const t = await getTranslations("logbook");
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-8">
      <Link href="/logbook" className="text-sm underline-offset-4 hover:underline">
        ← {t("detail.back")}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle as="h1">{t("scan.title")}</CardTitle>
          <CardDescription>{t("scan.description")}</CardDescription>
          {isOcrConfigured() && <CreditsNote userId={user.id} />}
        </CardHeader>
        <CardContent>
          {isOcrConfigured() ? (
            <ScanForm />
          ) : (
            <p className="text-sm text-muted-foreground">{t("scan.errors.not_configured")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
