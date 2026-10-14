import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BOARD_VIEWS,
  type BoardView,
  boardDays,
  boardRange,
  shiftDay,
} from "@/lib/airport-requests/board";
import { airportMovements } from "@/lib/airport-requests/queries";
import { myAirportRole } from "@/lib/airport-teams/teams";
import { requireUser } from "@/lib/auth/session";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { BoardViews } from "./board-views";
import { MovementRow } from "./movement-row";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("airportRequests.board");
  return { title: t("title") };
}

const isView = (v: unknown): v is BoardView => BOARD_VIEWS.includes(v as BoardView);

/**
 * The airfield's movements board (APT-6, Zlati: "who comes and goes, when, and what they need"):
 * arrivals, departures and aircraft on the ground by day, week or month, in UTC.
 */
export default async function AirportBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ ident: string }>;
  searchParams: Promise<{ view?: string; day?: string }>;
}) {
  const ident = decodeURIComponent((await params).ident);
  const base = `/airports/manage/${encodeURIComponent(ident)}`;
  const user = await requireUser(base);
  if (!(await myAirportRole(user.id, ident))) notFound();
  const query = await searchParams;
  const remembered = (await cookies()).get("airport-board-view")?.value;
  const view: BoardView = isView(query.view) ? query.view : isView(remembered) ? remembered : "day";
  const today = new Date().toISOString().slice(0, 10);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(query.day ?? "") ? query.day! : today;
  const range = boardRange(view, day);
  const movements = await airportMovements(user.id, ident, range.from, range.to);
  const days = boardDays(
    range.days,
    movements.map((m) => ({
      ...m,
      arrivalAt: m.request.arrivalAt,
      departureAt: m.request.departureAt,
    })),
  );
  const t = await getTranslations("airportRequests.board");
  const locale = intlLocale((await getLocale()) as Locale);
  const heading = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" });
  const period =
    view === "day"
      ? heading.format(range.from)
      : view === "week"
        ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).formatRange(
            range.from,
            new Date(range.to.getTime() - 1),
          )
        : new Intl.DateTimeFormat(locale, {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(range.from);
  const events = days.flatMap((d) => d.events);
  const live = (e: (typeof events)[number]) => e.item.request.status !== "declined";
  const counts = {
    arrivals: events.filter((e) => e.kind === "arrival" && live(e)).length,
    departures: events.filter((e) => e.kind === "departure" && live(e)).length,
    open: movements.filter((m) => m.request.status === "pending").length,
  };
  const shown = view === "day" ? days : days.filter((d) => d.events.length || d.onGround.length);
  const link = (d: string) => `${base}?view=${view}&day=${d}`;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle as="h2">{t("title")}</CardTitle>
          <BoardViews base={base} view={view} day={day} />
        </div>
        <CardDescription>{t("text")}</CardDescription>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" asChild>
            <Link href={link(shiftDay(view, day, -1))} aria-label={t("previous")}>
              <ChevronLeftIcon aria-hidden />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={link(today)}>{t("today")}</Link>
          </Button>
          <Button variant="outline" size="icon" asChild>
            <Link href={link(shiftDay(view, day, 1))} aria-label={t("next")}>
              <ChevronRightIcon aria-hidden />
            </Link>
          </Button>
          <span className="font-medium">{period}</span>
        </div>
        <p className="text-sm text-muted-foreground">{t("counts", counts)}</p>
      </CardHeader>
      <CardContent className="grid gap-6">
        {shown.length === 0 && <p className="text-sm text-muted-foreground">{t("none")}</p>}
        {shown.map((d) => (
          <section key={d.day} className="grid gap-1" aria-labelledby={`day-${d.day}`}>
            <h3 id={`day-${d.day}`} className="text-sm font-semibold">
              {heading.format(new Date(`${d.day}T00:00:00Z`))}
            </h3>
            {d.events.length === 0 && d.onGround.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("none")}</p>
            )}
            {d.events.length > 0 && (
              <ul className="grid divide-y">
                {d.events.map((e) => (
                  <MovementRow
                    key={`${e.kind}-${e.item.request.id}`}
                    movement={e.item}
                    kind={e.kind}
                    at={e.at}
                  />
                ))}
              </ul>
            )}
            {d.onGround.length > 0 && (
              <>
                <h4 className="mt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t("onGround")}
                </h4>
                <ul className="grid divide-y">
                  {d.onGround.map((m) => (
                    <MovementRow
                      key={`ground-${m.request.id}`}
                      movement={m}
                      kind="ground"
                      at={null}
                    />
                  ))}
                </ul>
              </>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
