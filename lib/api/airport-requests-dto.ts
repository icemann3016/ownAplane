import "server-only";

import type { z } from "zod";

import { requestWarnings } from "@/lib/airport-requests/checks";
import { estimate } from "@/lib/airport-requests/estimate";
import type {
  AirportRequestView,
  Movement,
  MyAirportRequest,
} from "@/lib/airport-requests/queries";
import type { AirportProfile } from "@/lib/airport-profile/queries";
import type { AirportRequestItem } from "@/lib/db/schema";
import type {
  airfieldMovement,
  airfieldServices,
  airportRequest,
  airportRequestSummary,
  myAirfield,
  place,
} from "./airport-requests";

// What the API sends back about airfields and requests to them (APT-1…7).

type Place = { ident: string; icaoCode: string | null; name: string; country: string };
const placeDto = (p: Place): z.infer<typeof place> => ({
  ident: p.ident,
  code: p.icaoCode ?? p.ident,
  name: p.name,
  country: p.country,
});
const iso = (d: Date | null) => d?.toISOString() ?? null;

export function airfieldServicesDto({
  airport,
  profile,
  services,
}: AirportProfile): z.infer<typeof airfieldServices> {
  return {
    airport: placeDto(airport),
    currency: profile.currency,
    pprRequired: profile.pprRequired,
    pprNoticeHours: profile.pprNoticeHours,
    services: services.map((s) => ({
      id: s.id,
      category: s.category,
      label: s.label,
      fuelType: s.fuelType,
      maxMtomKg: s.maxMtomKg,
      unit: s.unit,
      price: s.price,
      note: s.note,
    })),
  };
}

const itemDto = (i: AirportRequestItem) => ({
  serviceId: i.serviceId,
  category: i.category,
  label: i.label,
  fuelType: i.fuelType,
  maxMtomKg: i.maxMtomKg,
  unit: i.unit,
  price: i.price,
  quantity: i.quantity,
});

export function movementDto({
  request: r,
  from,
  to,
  pilot,
  items,
}: Pick<Movement, "request" | "from" | "to" | "pilot" | "items">): z.infer<
  typeof airfieldMovement
> {
  return {
    id: r.id,
    status: r.status,
    autoConfirmed: r.autoConfirmed,
    registration: r.registration,
    aircraftType: r.aircraftType,
    mtomKg: r.mtomKg,
    pob: r.pob,
    purpose: r.purpose,
    arrival: r.arrivalAt
      ? { at: r.arrivalAt.toISOString(), from: from ? placeDto(from) : null }
      : null,
    departure: r.departureAt
      ? { at: r.departureAt.toISOString(), to: to ? placeDto(to) : null }
      : null,
    services: items.map(itemDto),
    other: r.otherRequest,
    currency: r.currency,
    estimate: estimate(items),
    pilot: { id: r.pilotId, displayName: pilot },
    pprNumber: r.pprNumber,
    conditions: r.conditions,
    airfieldNote: r.operatorNote,
    answeredAt: iso(r.answeredAt),
    createdAt: r.createdAt.toISOString(),
  };
}

export function airportRequestDto(
  v: AirportRequestView,
  userId: string,
): z.infer<typeof airportRequest> {
  const r = v.request;
  const isPilot = r.pilotId === userId;
  return {
    ...movementDto(v),
    airport: placeDto(v.airport),
    yourRole: isPilot ? "pilot" : v.role,
    bookingId: isPilot ? r.bookingId : null,
    answeredBy: v.answeredBy,
    airfieldContact: { phone: v.operator.phone, email: v.operator.email },
    warnings: requestWarnings({
      arrivalAt: r.arrivalAt,
      departureAt: r.departureAt,
      airportCountry: v.airport.country,
      fromCountry: v.from?.country ?? null,
      toCountry: v.to?.country ?? null,
      asksCustoms: v.items.some((i) => i.category === "customs"),
      pprRequired: v.operator.pprRequired,
      pprNoticeHours: v.operator.pprNoticeHours,
      hours: v.hours,
      closures: v.closures,
      timeZone: v.airport.timezone,
      sentAt: r.createdAt,
    }),
  };
}

export const airportRequestSummaryDto = (
  r: MyAirportRequest,
): z.infer<typeof airportRequestSummary> => ({
  id: r.id,
  airport: placeDto(r.airport),
  status: r.status,
  autoConfirmed: r.autoConfirmed,
  registration: r.registration,
  arrivalAt: iso(r.arrivalAt),
  departureAt: iso(r.departureAt),
});

export function myAirfieldDto(
  { role, airport }: { role: "manager" | "staff"; airport: Place },
  today = { arrivals: 0, departures: 0, open: 0 },
): z.infer<typeof myAirfield> {
  return { airport: placeDto(airport), role, today };
}
