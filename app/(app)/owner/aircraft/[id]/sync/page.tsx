import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SectionHeading } from "@/components/aircraft/section-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwnAircraft } from "@/lib/aircraft/owner";
import { listConnections } from "@/lib/calendar-sync/owner";
import { AddConnection } from "./add-connection";
import { ConnectionCard } from "./connection-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aircraft.sections");
  return { title: t("sync") };
}

/** Calendar sync with other booking systems (SYN-1…5). */
export default async function SyncPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireOwnAircraft(id, "sync");
  const t = await getTranslations("calendarSync");
  const connections = await listConnections(user.id, id);

  return (
    <div className="grid gap-6">
      <SectionHeading title={t("title")} text={t("intro")} />
      <p className="text-sm">
        <Link href="/help/calendar-sync" className="underline">
          {t("helpLink")}
        </Link>
      </p>
      <section className="grid gap-4" aria-labelledby="connections">
        <h2 id="connections" className="text-lg font-semibold">
          {t("connections")}
        </h2>
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          connections.map((c) => <ConnectionCard key={c.id} c={c} />)
        )}
      </section>
      {connections.length < 10 && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("add.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AddConnection aircraftId={id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
