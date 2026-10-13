"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CalendarEntryKind } from "@/lib/db/schema";
import type { DayState } from "@/lib/domain/calendar";
import { cn } from "@/lib/utils";

/** One calendar entry as shown in a day's details (times as ISO strings, UTC). */
export type CalendarEntryView = {
  from: string;
  to: string;
  kind: CalendarEntryKind;
  /** A booking that's only requested. */
  pending?: boolean;
  /** Owner only: pilot's name or the block's note. */
  detail?: string | null;
  /** Owner only: link to the booking. */
  href?: string | null;
};

export type CalendarDayView = { day: string; state: DayState; entries: CalendarEntryView[] };

/** Legend order too. `unavailable` = an external booking (from a connected system). */
export const KIND_DOT: Record<CalendarEntryKind, string> = {
  booking: "bg-primary",
  unavailable: "bg-violet-500",
  owner_use: "bg-sky-500",
  maintenance: "bg-warning",
};

/**
 * Interactive month calendar in UTC (SRC-4, SRC-5). Hover, focus or tap a day for its entries.
 * Click a start day and an end day to pick dates: pilots then check availability or request a
 * booking, owners block the time.
 */
export function CalendarGrid({
  title,
  weekdays,
  firstWeekday,
  days,
  today,
  locale,
  mode,
  prevHref,
  nextHref,
  select,
}: {
  title: string;
  weekdays: string[];
  /** Blank cells before the 1st (Monday = 0). */
  firstWeekday: number;
  days: CalendarDayView[];
  /** YYYY-MM-DD in UTC. */
  today: string;
  locale: string;
  mode: "owner" | "public";
  prevHref: string;
  nextHref: string;
  /** Where picked dates go, or null to only show the calendar. */
  select:
    | { kind: "book"; aircraftId: string; canBook: boolean }
    | { kind: "block"; aircraftId: string }
    | null;
}) {
  const t = useTranslations("aircraft.calendar");
  const router = useRouter();
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [fromTime, setFromTime] = useState("08:00");
  const [toTime, setToTime] = useState("17:00");

  const time = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "UTC",
      }),
    [locale],
  );
  const dayLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }),
    [locale],
  );
  const dayShort = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }),
    [locale],
  );
  const label = (day: string) => dayLabel.format(new Date(`${day}T00:00:00Z`));
  // A span that doesn't start or end on this day is shown with the other day's date.
  const clock = (iso: string, day: string) => {
    const d = new Date(iso);
    const onDay = iso.slice(0, 10) === day;
    return onDay ? time.format(d) : `${dayShort.format(d)} ${time.format(d)}`;
  };

  function pick(day: string) {
    if (!select) return;
    if (!start || end || day < start) {
      setStart(day);
      setEnd(null);
    } else {
      setEnd(day);
    }
  }
  const rangeEnd = end ?? (start && hovered && hovered >= start ? hovered : null);
  const inRange = (day: string) =>
    Boolean(start && ((day >= start && rangeEnd && day <= rangeEnd) || day === start));

  const fromValue = start ? `${start}T${fromTime}` : "";
  const toValue = start ? `${end ?? start}T${toTime}` : "";
  const valid = Boolean(start && end && toValue > fromValue);
  const query = new URLSearchParams({ from: fromValue, to: toValue }).toString();

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href={prevHref} aria-label={t("previous")} scroll={false}>
            <ChevronLeftIcon aria-hidden />
          </Link>
        </Button>
        <h2 className="font-semibold capitalize" aria-live="polite">
          {title}
        </h2>
        <Button variant="ghost" size="icon" asChild>
          <Link href={nextHref} aria-label={t("next")} scroll={false}>
            <ChevronRightIcon aria-hidden />
          </Link>
        </Button>
      </div>
      {select && <p className="text-xs text-muted-foreground">{t("selectHint")}</p>}
      <ol
        className="grid grid-cols-7 gap-1 text-center text-sm"
        onMouseLeave={() => setHovered(null)}
      >
        {weekdays.map((w) => (
          <li key={w} className="pb-1 text-xs font-medium text-muted-foreground" aria-hidden>
            {w}
          </li>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <li key={`blank-${i}`} aria-hidden />
        ))}
        {days.map((c, index) => {
          const past = c.day < today;
          const selectable = Boolean(select) && !past && (mode === "owner" || c.state !== "busy");
          const selected = inRange(c.day);
          const kinds = [...new Set(c.entries.map((e) => e.kind))];
          const column = (firstWeekday + index) % 7;
          const open = active === c.day && c.entries.length > 0;
          return (
            <li key={c.day} className="relative">
              <button
                type="button"
                disabled={!selectable && c.entries.length === 0}
                aria-pressed={select ? selected : undefined}
                onClick={() => {
                  setActive(c.day);
                  if (selectable) pick(c.day);
                }}
                onMouseEnter={() => {
                  setHovered(c.day);
                  setActive(c.day);
                }}
                onMouseLeave={() => setActive((a) => (a === c.day ? null : a))}
                onFocus={() => setActive(c.day)}
                onBlur={() => setActive((a) => (a === c.day ? null : a))}
                className={cn(
                  "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border text-sm transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  past && "opacity-50",
                  c.day === today && "border-primary font-semibold",
                  mode === "public" &&
                    c.state === "busy" &&
                    "bg-muted text-muted-foreground line-through",
                  mode === "public" && c.state === "partly" && "bg-warning/15",
                  selectable && "cursor-pointer hover:border-primary",
                  selected && "border-primary bg-primary text-primary-foreground no-underline",
                  !selectable && c.entries.length === 0 && "cursor-default",
                )}
              >
                <span aria-hidden>{Number(c.day.slice(8))}</span>
                {kinds.length > 0 && (
                  <span className="flex gap-0.5" aria-hidden>
                    {kinds.map((k) => (
                      <span
                        key={k}
                        className={cn(
                          "size-1.5 rounded-full",
                          selected ? "bg-primary-foreground" : KIND_DOT[k],
                        )}
                      />
                    ))}
                  </span>
                )}
                <span className="sr-only">
                  {label(c.day)}: {t(`states.${c.state}`)}
                  {c.entries.length > 0 &&
                    `. ${c.entries
                      .map(
                        (e) =>
                          `${t(`kinds.${e.kind}`)}${e.pending ? ` (${t("pending")})` : ""} ${clock(e.from, c.day)}–${clock(e.to, c.day)} UTC${e.detail ? `, ${e.detail}` : ""}`,
                      )
                      .join("; ")}`}
                </span>
              </button>
              {open && (
                <div
                  role="tooltip"
                  className={cn(
                    "absolute top-full z-20 mt-1 w-60 rounded-md border bg-popover p-3 text-left text-xs text-popover-foreground shadow-md",
                    column >= 4 ? "right-0" : "left-0",
                  )}
                  onMouseEnter={() => setActive(c.day)}
                  onMouseLeave={() => setActive(null)}
                >
                  <p className="mb-1.5 font-semibold">{label(c.day)}</p>
                  <ul className="grid gap-1.5">
                    {c.entries.map((e, i) => (
                      <li key={i} className="flex gap-2">
                        <span
                          className={cn("mt-1 size-2 shrink-0 rounded-full", KIND_DOT[e.kind])}
                          aria-hidden
                        />
                        <span>
                          <span className="font-medium">
                            {clock(e.from, c.day)}–{clock(e.to, c.day)} UTC
                          </span>
                          <br />
                          {t(`kinds.${e.kind}`)}
                          {e.pending && ` · ${t("pending")}`}
                          {e.detail && (
                            <>
                              {" · "}
                              {e.href ? (
                                <Link href={e.href} className="underline underline-offset-2">
                                  {e.detail}
                                </Link>
                              ) : (
                                e.detail
                              )}
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(KIND_DOT) as CalendarEntryKind[]).map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", KIND_DOT[k])} aria-hidden />
            {t(`kinds.${k}`)}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t("timeZone")}</p>

      {select && start && (
        <div className="grid gap-3 rounded-md border p-3" aria-live="polite">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">
              {end
                ? t("selected", { from: label(start), to: label(end) })
                : t("selectEnd", { from: label(start) })}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t("clearSelection")}
              onClick={() => {
                setStart(null);
                setEnd(null);
              }}
            >
              <XIcon aria-hidden />
            </Button>
          </div>
          {end && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="calendar-from-time">{t("fromTime", { day: label(start) })}</Label>
                  <Input
                    id="calendar-from-time"
                    type="time"
                    value={fromTime}
                    onChange={(e) => setFromTime(e.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="calendar-to-time">{t("toTime", { day: label(end) })}</Label>
                  <Input
                    id="calendar-to-time"
                    type="time"
                    value={toTime}
                    onChange={(e) => setToTime(e.target.value)}
                  />
                </div>
              </div>
              {!valid && <p className="text-xs text-destructive">{t("endBeforeStart")}</p>}
              <div className="flex flex-wrap gap-2">
                {select.kind === "book" ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!valid}
                      onClick={() =>
                        router.push(
                          `/aircraft/${select.aircraftId}?${query}&month=${start.slice(0, 7)}`,
                          { scroll: false },
                        )
                      }
                    >
                      {t("checkAvailability")}
                    </Button>
                    {select.canBook && (
                      <Button
                        size="sm"
                        disabled={!valid}
                        onClick={() => router.push(`/aircraft/${select.aircraftId}/book?${query}`)}
                      >
                        {t("requestBooking")}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    size="sm"
                    disabled={!valid}
                    onClick={() =>
                      router.push(
                        `/owner/aircraft/${select.aircraftId}/calendar?${query}&month=${start.slice(0, 7)}#block`,
                        { scroll: false },
                      )
                    }
                  >
                    {t("blockTime")}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
