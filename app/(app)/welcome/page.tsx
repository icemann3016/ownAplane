import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  PlaneIcon,
  PlaneTakeoffIcon,
  TowerControlIcon,
  UsersIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { CompletionList } from "@/components/completion-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAirportAccount } from "@/lib/airport-teams/teams";
import { requireProfile } from "@/lib/auth/session";
import { getProfileCompletion } from "@/lib/dashboard/completion";
import { chooseRoles } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("welcome");
  return { title: t("metaTitle") };
}

const CHOICES = [
  { value: "pilot", icon: PlaneTakeoffIcon },
  { value: "owner", icon: PlaneIcon },
  { value: "both", icon: UsersIcon },
  { value: "airfield", icon: TowerControlIcon },
] as const;

/**
 * The guide after sign-up: say whether you fly, own an aircraft or both, then go through your
 * steps (profile, credentials, first listing) one by one. Also reachable from the dashboard.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { userId, profile, roles } = await requireProfile("/welcome");
  const { step } = await searchParams;
  const t = await getTranslations("welcome");
  const isPilot = roles.includes("pilot");
  const isOwner = roles.includes("owner");
  // Airfield accounts can't be pilots (Zlati, 2026-10-13).
  const airport = await isAirportAccount(userId);
  const firstName = profile.displayName.split(/\s+/)[0] ?? profile.displayName;

  if (step === "roles" || (!isPilot && !isOwner && !airport)) {
    const current = isPilot && isOwner ? "both" : isPilot ? "pilot" : isOwner ? "owner" : null;
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("rolesTitle", { name: firstName })}
          </h1>
          <p className="text-muted-foreground">{t("rolesText")}</p>
        </div>
        <form action={chooseRoles} className="grid gap-3 sm:grid-cols-2">
          {CHOICES.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="submit"
              name="choice"
              value={value}
              aria-pressed={current === value}
              disabled={airport && (value === "pilot" || value === "both")}
              className="grid content-start gap-2 rounded-xl border p-5 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 aria-pressed:border-primary"
            >
              <Icon className="size-6 text-primary" aria-hidden />
              <span className="font-semibold">{t(`choices.${value}.title`)}</span>
              <span className="text-sm text-muted-foreground">{t(`choices.${value}.text`)}</span>
            </button>
          ))}
        </form>
        {airport && <p className="text-sm text-muted-foreground">{t("airportNote")}</p>}
        <p className="text-xs text-muted-foreground">{t("rolesLater")}</p>
      </div>
    );
  }

  const completion = await getProfileCompletion(
    userId,
    { pilot: isPilot, owner: isOwner },
    profile,
  );
  const next = completion.todo[0];
  const groups = (["profile", "pilot", "owner"] as const).filter((g) =>
    completion.items.some((i) => i.group === g),
  );

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("stepsTitle")}</h1>
        <p className="text-muted-foreground">{t("progress", { percent: completion.percent })}</p>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <p className="flex-1 text-sm">
            {next ? t("nextStep") : t("allDone")}
            {next && <span className="block font-medium">{t(`next.${next.group}`)}</span>}
          </p>
          {next ? (
            <Button asChild>
              <Link href={next.href}>
                {t("continue")} <ArrowRightIcon aria-hidden />
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/dashboard">{t("toDashboard")}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
      {groups.map((group) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle as="h2">{t(`groups.${group}.title`)}</CardTitle>
            <CardDescription>{t(`groups.${group}.text`)}</CardDescription>
          </CardHeader>
          <CardContent>
            <CompletionList
              items={completion.items.filter((i) => i.group === group)}
              waiting={completion.waiting.filter((i) => i.group === group)}
              showDone
            />
          </CardContent>
        </Card>
      ))}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/welcome?step=roles" className="underline underline-offset-4">
          {t("changeRoles")}
        </Link>
        <Link href="/dashboard" className="underline underline-offset-4">
          {t("later")}
        </Link>
      </p>
    </div>
  );
}
