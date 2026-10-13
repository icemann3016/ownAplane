import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { FrequencyList, RunwayList } from "@/components/airports/runway-lists";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAirportProfile } from "@/lib/airport-profile/queries";
import { myAirportRole } from "@/lib/airport-teams/teams";
import { requireUser } from "@/lib/auth/session";
import { RemoveButton } from "../remove-button";
import { FrequencyForm } from "./frequency-form";
import { RunwayForm } from "./runway-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airports.tabs");
  return { title: t("runways") };
}

/** Runways and radio frequencies (APT-1): from OurAirports' open data, corrected by the team. */
export default async function AirportRunwaysPage({
  params,
}: {
  params: Promise<{ ident: string }>;
}) {
  const ident = decodeURIComponent((await params).ident);
  const user = await requireUser(`/airports/manage/${encodeURIComponent(ident)}/runways`);
  const [membership, data] = await Promise.all([
    myAirportRole(user.id, ident),
    getAirportProfile(ident),
  ]);
  if (!membership || !data) notFound();
  const t = await getTranslations("airports.runways");
  const manager = membership.role === "manager";

  return (
    <>
      <p className="text-sm text-muted-foreground">{t("source")}</p>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("runwaysTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <RunwayList
            runways={data.runways}
            action={
              manager
                ? (r) => (
                    <RemoveButton
                      ident={ident}
                      item="runway"
                      id={r.id}
                      label={t("removeRunway", { runway: r.designator })}
                      text={t("remove")}
                    />
                  )
                : undefined
            }
          />
          {manager && <RunwayForm ident={ident} />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("frequenciesTitle")}</CardTitle>
          <CardDescription>{t("frequenciesText")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <FrequencyList
            frequencies={data.frequencies}
            action={
              manager
                ? (f) => (
                    <RemoveButton
                      ident={ident}
                      item="frequency"
                      id={f.id}
                      label={t("removeFrequency", { type: f.type, mhz: f.mhz.toFixed(3) })}
                      text={t("remove")}
                    />
                  )
                : undefined
            }
          />
          {manager && <FrequencyForm ident={ident} />}
        </CardContent>
      </Card>
    </>
  );
}
