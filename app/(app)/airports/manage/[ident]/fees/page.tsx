import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { FeeList } from "@/components/airports/fee-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAirportProfile } from "@/lib/airport-profile/queries";
import { myAirportRole } from "@/lib/airport-teams/teams";
import { requireUser } from "@/lib/auth/session";
import { RemoveButton } from "../remove-button";
import { FeeForm } from "./fee-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airports.tabs");
  return { title: t("fees") };
}

/** Landing, parking and hangar fees for pilots to see (APT-1); no money moves in the app. */
export default async function AirportFeesPage({ params }: { params: Promise<{ ident: string }> }) {
  const ident = decodeURIComponent((await params).ident);
  const user = await requireUser(`/airports/manage/${encodeURIComponent(ident)}/fees`);
  const [membership, data] = await Promise.all([
    myAirportRole(user.id, ident),
    getAirportProfile(ident),
  ]);
  if (!membership || !data) notFound();
  const t = await getTranslations("airports.fees");
  const manager = membership.role === "manager";
  const currency = data.profile.currency;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("text", { currency })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <FeeList
          fees={data.fees}
          currency={currency}
          action={
            manager
              ? (f) => (
                  <RemoveButton
                    ident={ident}
                    item="fee"
                    id={f.id}
                    label={t("removeLabel", { fee: f.label ?? t(`kinds.${f.kind}`) })}
                    text={t("remove")}
                  />
                )
              : undefined
          }
        />
        {manager && <FeeForm ident={ident} currency={currency} />}
      </CardContent>
    </Card>
  );
}
