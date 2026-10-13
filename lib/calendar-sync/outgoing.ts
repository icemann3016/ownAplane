// What another system gets about ownAplane's busy times (SYN-3, SYN-4): always the times and
// whether it's a booking; the rest only as the owner chose (EXPORT_FIELDS). Pure.
import type { CalendarEntryKind } from "@/lib/db/schema";
import type { ExportField } from "./fields";
import type { IcsEvent } from "./ics";

export type BusyDetail = {
  id: string;
  from: Date;
  to: Date;
  kind: CalendarEntryKind;
  /** From another connected system (its titles are never passed on). */
  external: boolean;
  bookingId: string | null;
  bookingStatus: string | null;
  departure: string | null;
  arrival: string | null;
  pilotName: string | null;
  note: string | null;
  registration: string;
};

/** The details the owner shares, `undefined` for the rest (left out of the output). */
export function sharedDetails(b: BusyDetail, fields: readonly ExportField[], bookingUrl: string) {
  const has = (f: ExportField) => fields.includes(f);
  const booking = b.kind === "booking";
  return {
    type: has("type") ? b.kind : undefined,
    status: has("status") && booking ? (b.bookingStatus ?? undefined) : undefined,
    route:
      has("route") && booking && b.departure && b.arrival
        ? { departure: b.departure, arrival: b.arrival }
        : undefined,
    pilot: has("pilot") && booking && b.pilotName ? { name: b.pilotName } : undefined,
    booking:
      has("reference") && booking && b.bookingId ? { id: b.bookingId, url: bookingUrl } : undefined,
    note: has("note") && !booking && !b.external && b.note ? b.note : undefined,
    registration: has("registration") ? b.registration : undefined,
  };
}

export type IcsTexts = {
  /** `busy` when the type isn't shared; `unavailable` = a booking from another connected system. */
  titles: Record<"booked" | "busy" | "owner_use" | "maintenance" | "unavailable", string>;
  labels: Record<"status" | "route" | "pilot" | "booking" | "note" | "aircraft", string>;
  statuses: Record<string, string>;
};

export function toIcsEvent(
  b: BusyDetail,
  fields: readonly ExportField[],
  texts: IcsTexts,
  bookingUrl: string,
): IcsEvent {
  const d = sharedDetails(b, fields, bookingUrl);
  const summary =
    b.kind === "booking" ? texts.titles.booked : d.type ? texts.titles[b.kind] : texts.titles.busy;
  const lines = [
    d.status && `${texts.labels.status}: ${texts.statuses[d.status] ?? d.status}`,
    d.route && `${texts.labels.route}: ${d.route.departure} → ${d.route.arrival}`,
    d.pilot && `${texts.labels.pilot}: ${d.pilot.name}`,
    d.booking && `${texts.labels.booking}: ${d.booking.url}`,
    d.note && `${texts.labels.note}: ${d.note}`,
    d.registration && `${texts.labels.aircraft}: ${d.registration}`,
  ].filter(Boolean);
  return {
    id: b.id,
    from: b.from,
    to: b.to,
    summary,
    description: lines.length ? lines.join("\n") : undefined,
    location: d.route?.departure,
    status: d.status ? (d.status === "requested" ? "TENTATIVE" : "CONFIRMED") : undefined,
    url: d.booking?.url,
  };
}
