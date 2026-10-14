import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTeam } from "@/lib/airport-teams/teams";
import { requireUser } from "@/lib/auth/session";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { cancelInviteAction } from "../actions";
import { InviteForm } from "./invite-form";
import { MemberActions } from "./member-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airports.team");
  return { title: t("metaTitle") };
}

/** An airfield's team (APT-1): members, roles and invitations. Only its members see it. */
export default async function AirportTeamPage({ params }: { params: Promise<{ ident: string }> }) {
  const ident = decodeURIComponent((await params).ident);
  const user = await requireUser(`/airports/manage/${encodeURIComponent(ident)}/team`);
  const team = await getTeam(user.id, ident);
  if (!team) notFound();
  const t = await getTranslations("airports");
  const locale = (await getLocale()) as Locale;
  const day = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" });
  const manager = team.role === "manager";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <UsersIcon className="size-5 text-primary" aria-hidden /> {t("team.members")}
          </CardTitle>
          <CardDescription>{t("team.rolesText")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid divide-y">
            {team.members.map((m) => {
              const self = m.userId === user.id;
              return (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="grid min-w-0 gap-0.5">
                    <span className="font-medium">
                      <Link href={`/u/${m.userId}`} className="underline-offset-4 hover:underline">
                        {m.name}
                      </Link>
                      {self && <span className="text-muted-foreground"> ({t("team.you")})</span>}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t(`roles.${m.role}`)} · {t("team.since", { date: day.format(m.since) })}
                    </span>
                  </div>
                  <div className="ml-auto">
                    <MemberActions
                      ident={ident}
                      userId={m.userId}
                      name={m.name}
                      role={m.role}
                      self={self}
                      manager={manager}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {manager && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("team.invite")}</CardTitle>
            <CardDescription>{t("team.inviteText")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <InviteForm ident={ident} />
            {team.invites.length > 0 && (
              <section className="grid gap-2" aria-labelledby="invites">
                <h3 id="invites" className="text-sm font-medium">
                  {t("team.openInvites")}
                </h3>
                <ul className="grid divide-y text-sm">
                  {team.invites.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
                      <span className="grid min-w-0 gap-0.5">
                        <span className="break-all">{i.email}</span>
                        <span className="text-muted-foreground">
                          {t("team.inviteExpires", {
                            role: t(`roles.${i.role}`),
                            date: day.format(i.expiresAt),
                          })}
                        </span>
                      </span>
                      <form action={cancelInviteAction} className="ml-auto">
                        <input type="hidden" name="ident" value={ident} />
                        <input type="hidden" name="id" value={i.id} />
                        <SubmitButton
                          variant="ghost"
                          size="sm"
                          aria-label={t("team.cancelInviteLabel", { email: i.email })}
                        >
                          {t("team.cancelInvite")}
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
