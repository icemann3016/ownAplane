import type { Metadata } from "next";
import { TowerControlIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inviteByToken } from "@/lib/airport-teams/invites";
import { requireUser } from "@/lib/auth/session";
import { AcceptForm } from "./accept-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airports.join");
  return { title: t("title") };
}

/** An invitation to an airfield's team (APT-1): who invites whom, and joining. */
export default async function AirportInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await requireUser(`/airports/invite/${token}`);
  const t = await getTranslations("airports");
  const invite = await inviteByToken(token);
  const valid = invite && !invite.acceptedAt && invite.expiresAt > new Date();
  const ownEmail = valid && user.email.toLowerCase() === invite.email;

  return (
    <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-6 px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="flex items-center gap-2 text-xl">
            <TowerControlIcon className="size-5 text-primary" aria-hidden /> {t("join.title")}
          </CardTitle>
          {valid && (
            <CardDescription>
              {t("join.invitedAs", {
                airport: `${invite.airport.icaoCode ?? invite.airport.ident} ${invite.airport.name}`,
                role: t(`roles.${invite.role}`),
              })}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {!valid ? (
            <p>{t("join.invalid")}</p>
          ) : ownEmail ? (
            <AcceptForm token={token} />
          ) : (
            <p>{t("join.otherEmail", { email: invite.email })}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
