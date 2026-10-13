import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { myAirports } from "@/lib/airport-teams/teams";
import { requireProfile } from "@/lib/auth/session";
import { getDashboard } from "@/lib/dashboard";
import { getProfileCompletion } from "@/lib/dashboard/completion";
import { intlLocale } from "@/lib/i18n/config";
import { credentialLabel, type PilotTranslate } from "@/lib/pilot/labels";
import { AirfieldsCard } from "./airfields-card";
import { OwnerCard } from "./owner-card";
import { PilotCard } from "./pilot-card";
import { CompletionCard } from "./completion-card";
import { type TodoItem, TodoCard } from "./todo-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.nav");
  return { title: t("dashboard") };
}

/**
 * The user's overview: what needs doing, then their side as a pilot and as an owner, each
 * linking to the page where the details are.
 */
export default async function DashboardPage() {
  const { userId, profile, roles } = await requireProfile("/dashboard");
  const t = await getTranslations("dashboard");
  const isPilot = roles.includes("pilot");
  const isOwner = roles.includes("owner");
  const [data, completion, airfields] = await Promise.all([
    getDashboard(userId, { pilot: isPilot, owner: isOwner }),
    getProfileCompletion(userId, { pilot: isPilot, owner: isOwner }, profile),
    myAirports(userId),
  ]);
  const firstName = profile.displayName.split(/\s+/)[0] ?? profile.displayName;
  const summary = data.pilot?.credentials ?? null;

  // Credentials that expired, expire soon or were rejected, e.g. "Class 2 medical expires on …".
  const tp = (await getTranslations("pilot")) as unknown as PilotTranslate;
  const day = new Intl.DateTimeFormat(intlLocale(await getLocale()), {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const credentialItems: TodoItem[] = summary
    ? [
        ...[...summary.expired, ...summary.expiring].map((item) => ({
          key: `cred-${item.id}`,
          href: "/account/credentials",
          urgent: true,
          text: t(summary.expired.includes(item) ? "credentialExpired" : "credentialExpiring", {
            item: credentialLabel(item.ref!, tp),
            date: day.format(new Date(`${item.expiresOn}T00:00:00Z`)),
          }),
        })),
        ...(summary.rejected
          ? [
              {
                key: "cred-rejected",
                href: "/account/credentials",
                urgent: true,
                text: t("todo.credentialsRejected", { count: summary.rejected }),
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title", { name: firstName })}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {airfields.length > 0 && <AirfieldsCard airfields={airfields} />}

      <CompletionCard completion={completion} />

      <TodoCard todo={data.todo} credentialItems={credentialItems} />

      {(data.pilot || data.owner) && (
        <div
          className={
            data.pilot && data.owner ? "grid items-start gap-6 lg:grid-cols-2" : "grid gap-6"
          }
        >
          {data.pilot && <PilotCard pilot={data.pilot} />}
          {data.owner && <OwnerCard owner={data.owner} />}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {t("publicProfile")}{" "}
        <Link href={`/u/${userId}`} className="text-foreground underline underline-offset-4">
          {t("seeWhatOthersSee")}
        </Link>
        {" · "}
        <Link href="/account" className="text-foreground underline underline-offset-4">
          {t("accountLink")}
        </Link>
      </p>
    </div>
  );
}
