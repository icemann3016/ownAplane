import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AircraftStatusBadge } from "@/components/aircraft/aircraft-status-badge";
import { Button } from "@/components/ui/button";
import { requireOwnAircraft } from "@/lib/aircraft/owner";
import { getListingGaps } from "@/lib/aircraft/queries";
import { SectionNav } from "./section-nav";

/** Frame of the owner's listing pages: title, status and the section tabs. */
export default async function AircraftLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const { user, aircraft } = await requireOwnAircraft(id);
  const t = await getTranslations("aircraft");
  const gaps = await getListingGaps(user.id, id);
  const done = [
    "details",
    ...(gaps.includes("home_base") ? [] : ["base"]),
    ...(gaps.includes("price") ? [] : ["pricing"]),
    ...(gaps.includes("photo") ? [] : ["photos"]),
    ...(gaps.includes("arc") || gaps.includes("insurance") ? [] : ["documents"]),
  ];

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 px-4 py-10">
      <Button variant="ghost" size="sm" className="-ml-3 justify-self-start" asChild>
        <Link href="/owner/aircraft">
          <ArrowLeftIcon aria-hidden /> {t("edit.back")}
        </Link>
      </Button>
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-2xl font-semibold tracking-tight">{aircraft.registration}</p>
          <AircraftStatusBadge status={aircraft.status} label={t(`statuses.${aircraft.status}`)} />
        </div>
        <p className="text-muted-foreground">
          {aircraft.manufacturer} {aircraft.model}
        </p>
      </div>
      <SectionNav id={id} done={done} />
      {children}
    </div>
  );
}
