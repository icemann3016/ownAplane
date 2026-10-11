import "server-only";

import { z } from "zod";

import { LISTING_GAPS } from "@/lib/aircraft/catalog";
import { getAircraftDocuments } from "@/lib/aircraft/documents";
import {
  getListingGaps,
  getOwnAircraft,
  getPhotos,
  type OwnAircraftSummary,
} from "@/lib/aircraft/queries";
import { getRequirements } from "@/lib/aircraft/requirements";
import { absoluteUrl } from "./dto";
import { ApiError, json } from "./http";

// The owner's view of their aircraft in the API: every field (SI units), what still stops the
// listing, photos, documents with their review, and the rental requirements.

const gap = z.enum(LISTING_GAPS);

export const myAircraftSummary = z.object({
  id: z.uuid(),
  registration: z.string(),
  manufacturer: z.string(),
  model: z.string(),
  status: z.string().describe("draft, listed, paused, unlisted, grounded"),
  unlistedReason: z.string().nullable(),
  homeAirport: z.string().nullable(),
  pricePerHour: z.number().nullable(),
  currency: z.string(),
  priceBasis: z.string(),
  coverUrl: z.url().nullable(),
  gaps: z.array(gap).describe("What still stops it being listed"),
});

export const myAircraft = myAircraftSummary.extend({
  category: z.string(),
  typeDesignator: z.string(),
  year: z.number().nullable(),
  seats: z.number(),
  engine: z.string().nullable(),
  fuelType: z.string(),
  fuelBurnLph: z.number().nullable(),
  cruiseKt: z.number().nullable(),
  usefulLoadKg: z.number().nullable(),
  mtomKg: z.number().nullable(),
  enduranceH: z.number().nullable(),
  avionics: z.string().nullable(),
  autopilot: z.boolean(),
  transponder: z.string(),
  nightVfr: z.boolean(),
  ifr: z.boolean(),
  description: z.string().nullable(),
  weekendPricePerHour: z.number().nullable(),
  timeBasis: z.string(),
  minHoursPerDay: z.number().nullable(),
  oilUnit: z.string(),
  cancellationPolicy: z.string(),
  rating: z.object({ average: z.number().nullable(), count: z.number() }),
  photos: z.array(z.object({ id: z.uuid(), url: z.url() })),
  documents: z.array(
    z.object({
      id: z.uuid(),
      kind: z.string(),
      title: z.string().nullable(),
      expiresOn: z.iso.date().nullable(),
      status: z
        .enum(["pending", "verified", "rejected"])
        .nullable()
        .describe("CofA, ARC, insurance: checked by an admin; reference documents: null"),
      rejectionReason: z.string().nullable(),
      file: z.object({ id: z.uuid(), filename: z.string(), url: z.url() }),
    }),
  ),
  requirements: z
    .object({
      minPilotRating: z.number().nullable(),
      allowUnrated: z.boolean(),
      unratedNeedsCheckout: z.boolean(),
      checkoutFirstRental: z.boolean(),
      instantBooking: z.boolean(),
      licenceTypes: z.array(z.string()),
      requiredRatings: z.array(z.string()),
      minTotalHours: z.number().nullable(),
      minTypeHours: z.number().nullable(),
      min90DaysHours: z.number().nullable(),
      minAge: z.number().nullable(),
    })
    .nullable(),
});

export function myAircraftSummaryDto(a: OwnAircraftSummary): z.infer<typeof myAircraftSummary> {
  return {
    id: a.id,
    registration: a.registration,
    manufacturer: a.manufacturer,
    model: a.model,
    status: a.status,
    unlistedReason: a.unlistedReason,
    homeAirport: a.homeAirportIdent,
    pricePerHour: a.pricePerHour,
    currency: a.currency,
    priceBasis: a.priceBasis,
    coverUrl: absoluteUrl(a.coverUrl),
    gaps: a.gaps ?? [],
  };
}

/** The whole aircraft for its owner, or 404 (also for other people's aircraft). */
export async function myAircraftDto(
  userId: string,
  id: string,
): Promise<z.infer<typeof myAircraft>> {
  const a = await getOwnAircraft(userId, id);
  if (!a) throw new ApiError("not_found", "No such aircraft.");
  const [gaps, photos, documents, requirements] = await Promise.all([
    getListingGaps(userId, id),
    getPhotos(userId, id),
    getAircraftDocuments(userId, id),
    getRequirements(userId, id),
  ]);
  const { ownerId: _o, homeAirportIdent, ratingAvg, ratingCount, createdAt: _c, ...fields } = a;
  const { updatedAt: _u, ...rest } = fields;
  return {
    ...rest,
    homeAirport: homeAirportIdent,
    coverUrl: photos[0] ? absoluteUrl(photos[0].url) : null,
    gaps,
    rating: { average: ratingAvg, count: ratingCount },
    photos: photos.map((p) => ({ id: p.id, url: absoluteUrl(p.url) })),
    documents: documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      expiresOn: d.expiresOn,
      status: d.status,
      rejectionReason: d.status === "rejected" ? d.rejectionReason : null,
      file: {
        id: d.documentId,
        filename: d.filename,
        url: absoluteUrl(`/api/v1/documents/${d.documentId}`),
      },
    })),
    requirements: requirements
      ? {
          minPilotRating: requirements.minPilotRating,
          allowUnrated: requirements.allowUnrated,
          unratedNeedsCheckout: requirements.unratedNeedsCheckout,
          checkoutFirstRental: requirements.checkoutFirstRental,
          instantBooking: requirements.instantBooking,
          licenceTypes: requirements.licenceTypes,
          requiredRatings: requirements.requiredRatings,
          minTotalHours: requirements.minTotalHours,
          minTypeHours: requirements.minTypeHours,
          min90DaysHours: requirements.min90DaysHours,
          minAge: requirements.minAge,
        }
      : null,
  };
}

/** The aircraft as it is now. */
export async function myAircraftResponse(userId: string, id: string, status = 200) {
  return json({ data: await myAircraftDto(userId, id) }, { status });
}
