import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAirportProfile } from "@/lib/airport-profile/queries";
import { myAirportRole } from "@/lib/airport-teams/teams";
import { requireUser } from "@/lib/auth/session";
import { ManagersOnly } from "../managers-only";
import { ProfileForm } from "./profile-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airports.tabs");
  return { title: t("profile") };
}

/** An airfield's description, contacts, PPR rules, services and fuel (APT-1). */
export default async function AirportProfilePage({
  params,
}: {
  params: Promise<{ ident: string }>;
}) {
  const ident = decodeURIComponent((await params).ident);
  const user = await requireUser(`/airports/manage/${encodeURIComponent(ident)}/profile`);
  const [membership, data] = await Promise.all([
    myAirportRole(user.id, ident),
    getAirportProfile(ident),
  ]);
  if (!membership || !data) notFound();
  const t = await getTranslations("airports");
  const p = data.profile;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("tabs.profile")}</CardTitle>
      </CardHeader>
      <CardContent>
        {membership.role === "manager" ? (
          <ProfileForm
            ident={ident}
            initial={{
              description: p.description,
              phone: p.phone,
              email: p.email,
              website: p.website,
              pprRequired: p.pprRequired,
              pprNoticeHours: p.pprNoticeHours,
              currency: p.currency,
              services: p.services,
              fuels: p.fuels,
            }}
          />
        ) : (
          <ManagersOnly ident={ident} />
        )}
      </CardContent>
    </Card>
  );
}
