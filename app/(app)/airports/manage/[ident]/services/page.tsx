import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ServiceList } from "@/components/airports/service-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAirportProfile } from "@/lib/airport-profile/queries";
import { myAirportRole } from "@/lib/airport-teams/teams";
import { requireUser } from "@/lib/auth/session";
import { RemoveButton } from "../remove-button";
import { ServiceForm } from "./service-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airports.tabs");
  return { title: t("services") };
}

/**
 * What the airfield offers and at what price (Zlati, 2026-10-13): landing charges, handling,
 * parking, customs, fuel, oil, anything else. Pilots pick from it in their requests; managers
 * keep it (?edit=<id> opens a line in the form).
 */
export default async function AirportServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ ident: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const ident = decodeURIComponent((await params).ident);
  const { edit } = await searchParams;
  const base = `/airports/manage/${encodeURIComponent(ident)}/services`;
  const user = await requireUser(base);
  const [membership, data] = await Promise.all([
    myAirportRole(user.id, ident),
    getAirportProfile(ident),
  ]);
  if (!membership || !data) notFound();
  const t = await getTranslations("airports.catalog");
  const manager = membership.role === "manager";
  const currency = data.profile.currency;
  const editing = manager ? data.services.find((s) => s.id === edit) : undefined;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("title")}</CardTitle>
          <CardDescription>{t("text", { currency })}</CardDescription>
        </CardHeader>
        <CardContent>
          <ServiceList
            services={data.services}
            currency={currency}
            action={
              manager
                ? (s, name) => (
                    <>
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`${base}?edit=${s.id}#service-form`}
                          aria-label={t("editLabel", { item: name })}
                        >
                          {t("edit")}
                        </Link>
                      </Button>
                      <RemoveButton
                        ident={ident}
                        item="service"
                        id={s.id}
                        label={t("removeLabel", { item: name })}
                        text={t("remove")}
                      />
                    </>
                  )
                : undefined
            }
          />
        </CardContent>
      </Card>
      {manager && (
        <Card id="service-form">
          <CardHeader>
            <CardTitle as="h2">{editing ? t("editTitle") : t("addTitle")}</CardTitle>
            <CardDescription>{t("formText")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ServiceForm
              key={editing?.id ?? "new"}
              ident={ident}
              currency={currency}
              editing={editing ?? null}
              cancelHref={base}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
