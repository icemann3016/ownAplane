import "server-only";

import type { getProfileAndRoles, getOwnSettings } from "@/lib/account/profile";
import type { SearchResult } from "@/lib/aircraft/search";
import type { getVisibleAircraft } from "@/lib/aircraft/public";
import type { AirportSummary } from "@/lib/airports";
import { avatarUrl } from "@/lib/avatar-url";
import type { BookingDetail as BookingRow, BookingListItem } from "@/lib/bookings/queries";
import { appUrl } from "@/lib/site-url";
import type * as R from "./responses";

// What the API returns (plan §4.9): explicit shapes, so internal columns never leak and the
// database can change without breaking apps. Times ISO 8601 UTC, quantities in SI units.

/** Files served by our own site have relative URLs; apps need absolute ones. */
export function absoluteUrl(url: string): string;
export function absoluteUrl(url: string | null): string | null;
export function absoluteUrl(url: string | null): string | null {
  return url && url.startsWith("/") ? `${appUrl()}${url}` : url;
}

const iso = (d: Date | string | null | undefined) =>
  d === null || d === undefined ? null : new Date(d).toISOString();

export function airportDto(a: AirportSummary): R.Airport {
  return {
    ident: a.ident,
    code: a.code,
    iataCode: a.iataCode,
    name: a.name,
    municipality: a.municipality,
    country: a.country,
    type: a.type,
    timezone: a.timezone,
  };
}

type Account = NonNullable<Awaited<ReturnType<typeof getProfileAndRoles>>>;
type Settings = Awaited<ReturnType<typeof getOwnSettings>>;

export function meDto(
  user: { id: string; email: string; emailVerified: boolean },
  { profile, roles }: Account,
  settings: Settings,
): R.Me {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: absoluteUrl(avatarUrl(profile.avatarKey)),
    homeAirportIdent: profile.homeAirportIdent,
    roles,
    locale: settings.locale,
    units: settings.units,
    phone: settings.phone,
    rating: {
      asPilot: { average: profile.ratingAvg, count: profile.ratingCount },
      asOwner: { average: profile.ownerRatingAvg, count: profile.ownerRatingCount },
    },
    createdAt: iso(profile.createdAt),
  };
}

export function aircraftSummaryDto(r: SearchResult): R.AircraftSummary {
  return {
    id: r.id,
    registration: r.registration,
    manufacturer: r.manufacturer,
    model: r.model,
    category: r.category,
    seats: r.seats,
    price: { perHour: r.pricePerHour, currency: r.currency, basis: r.priceBasis },
    rating: { average: r.ratingAvg, count: r.ratingCount },
    homeAirport: {
      ident: r.airportIdent,
      code: r.airportCode,
      name: r.airportName,
      municipality: r.municipality,
      latitude: r.latitude,
      longitude: r.longitude,
    },
    distanceKm: r.distanceKm,
    coverPhotoUrl: absoluteUrl(r.coverUrl),
  };
}

type VisibleAircraft = NonNullable<Awaited<ReturnType<typeof getVisibleAircraft>>>;

export function aircraftDto(
  { aircraft: a, owner }: VisibleAircraft,
  photos: { url: string }[],
  homeAirport: AirportSummary | null,
): R.AircraftDetail {
  return {
    id: a.id,
    status: a.status,
    registration: a.registration,
    manufacturer: a.manufacturer,
    model: a.model,
    typeDesignator: a.typeDesignator,
    year: a.year,
    category: a.category,
    seats: a.seats,
    engine: a.engine,
    fuelType: a.fuelType,
    performance: {
      fuelBurnLitresPerHour: a.fuelBurnLph,
      cruiseKt: a.cruiseKt,
      usefulLoadKg: a.usefulLoadKg,
      enduranceHours: a.enduranceH,
    },
    equipment: {
      avionics: a.avionics,
      autopilot: a.autopilot,
      transponder: a.transponder,
      nightVfr: a.nightVfr,
      ifr: a.ifr,
    },
    description: a.description,
    homeAirport: homeAirport ? airportDto(homeAirport) : null,
    price: {
      perHour: a.pricePerHour,
      weekendPerHour: a.weekendPricePerHour,
      currency: a.currency,
      basis: a.priceBasis,
      timeBasis: a.timeBasis,
      minHoursPerDay: a.minHoursPerDay,
    },
    oilUnit: a.oilUnit,
    cancellationPolicy: a.cancellationPolicy,
    rating: { average: a.ratingAvg, count: a.ratingCount },
    owner: {
      id: owner.id,
      displayName: owner.displayName,
      avatarUrl: absoluteUrl(avatarUrl(owner.avatarKey)),
      rating: { average: owner.ratingAvg, count: owner.ratingCount },
    },
    photos: photos.map((p) => absoluteUrl(p.url)),
  };
}

export function bookingSummaryDto(b: BookingListItem): R.BookingSummary {
  return {
    id: b.id,
    status: b.status,
    role: b.role,
    from: iso(b.from),
    to: iso(b.to),
    departureIdent: b.departureIdent,
    arrivalIdent: b.arrivalIdent,
    estimate: { amount: b.estimate, currency: b.currency },
    expiresAt: b.status === "requested" ? iso(b.expiresAt) : null,
    aircraft: {
      id: b.aircraft.id,
      registration: b.aircraft.registration,
      manufacturer: b.aircraft.manufacturer,
      model: b.aircraft.model,
    },
  };
}

const person = (p: { id: string; displayName: string; avatarKey: string | null } | null) =>
  p && { id: p.id, displayName: p.displayName, avatarUrl: absoluteUrl(avatarUrl(p.avatarKey)) };

export function bookingDto(d: BookingRow, viewerId: string): R.BookingDetail {
  const b = d.booking;
  return {
    id: b.id,
    status: b.status,
    role: b.pilotId === viewerId ? "pilot" : b.ownerId === viewerId ? "owner" : "admin",
    from: iso(d.period.from),
    to: iso(d.period.to),
    route: d.route.map((a) => ({ ident: a.ident, code: a.code, name: a.name })),
    purpose: b.purpose,
    passengers: b.passengers,
    plannedHours: b.plannedHours,
    message: b.message,
    price: {
      perHour: b.pricePerHour,
      weekendPerHour: b.weekendPricePerHour,
      minHoursPerDay: b.minHoursPerDay,
      currency: b.currency,
      basis: b.priceBasis,
      timeBasis: b.timeBasis,
      estimate: b.estimate,
    },
    cancellationPolicy: b.cancellationPolicy,
    checkoutRequired: b.checkoutRequired,
    expiresAt: b.status === "requested" ? iso(b.expiresAt) : null,
    respondedAt: iso(b.respondedAt),
    ownerNote: b.ownerNote,
    proposal: d.proposal && { from: iso(d.proposal.from), to: iso(d.proposal.to) },
    cancellation: b.cancelledAt
      ? {
          at: iso(b.cancelledAt),
          byId: b.cancelledBy,
          reason: b.cancelReason,
          late: b.lateCancellation,
        }
      : null,
    aircraft: {
      id: d.aircraft.id,
      registration: d.aircraft.registration,
      manufacturer: d.aircraft.manufacturer,
      model: d.aircraft.model,
      typeDesignator: d.aircraft.typeDesignator,
    },
    pilot: person(d.pilot),
    owner: person(d.owner),
    history: d.events.map((e) => ({ type: e.type, actorId: e.actorId, at: iso(e.createdAt) })),
    createdAt: iso(b.createdAt),
  };
}
