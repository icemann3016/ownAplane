import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, InfoIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/session";
import { ClaimForm } from "./claim-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airports.claim");
  return { title: t("title") };
}

/**
 * Claim an airfield (APT-1): an admin checks the proof before it appears on ownAplane. Pilot
 * accounts can't: airfield accounts are separate (Zlati, 2026-10-13).
 */
export default async function ClaimAirportPage() {
  const { roles } = await requireProfile("/airports/manage/claim");
  const t = await getTranslations("airports");
  return (
    <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-6 px-4 py-10">
      <Button variant="ghost" size="sm" className="-ml-3 justify-self-start" asChild>
        <Link href="/airports/manage">
          <ArrowLeftIcon aria-hidden /> {t("manage.title")}
        </Link>
      </Button>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("claim.title")}</h1>
        <p className="text-muted-foreground">{t("claim.description")}</p>
      </div>
      {roles.includes("pilot") ? (
        <Alert>
          <InfoIcon aria-hidden />
          <AlertDescription>{t("claim.pilotAccount")}</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent>
            <ClaimForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
