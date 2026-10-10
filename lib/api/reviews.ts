import "server-only";

import { z } from "zod";

import { avatarUrl } from "@/lib/avatar-url";
import type { ReviewView } from "@/lib/reviews/queries";
import { absoluteUrl } from "./dto";
import { errors, jsonBody, ok, output, pathId, ref, signedIn } from "./openapi-helpers";

// Reviews in the API (RAT-1…5): input, shape, DTO and OpenAPI paths of this area.

const time = z.iso.datetime().describe("ISO 8601, UTC");
const id = z.uuid();

export const reviewBody = z.object({
  scores: z
    .record(z.string(), z.number().int().min(1).max(5))
    .describe(
      "1–5 per category. Pilot → owner: aircraft_condition, communication, value. Owner → pilot: airmanship, punctuality, communication, condition_returned",
    ),
  comment: z.string().trim().max(2000).default(""),
});

export const replyBody = z.object({ text: z.string().trim().min(1).max(1000) });

export const review = z.object({
  id,
  bookingId: id,
  direction: z.enum(["pilot_to_owner", "owner_to_pilot"]),
  overall: z.number(),
  scores: z.record(z.string(), z.number()),
  comment: z.string().nullable(),
  submittedAt: time,
  publishedAt: time.nullable().describe("null while double-blind: only its author sees it"),
  reply: z.string().nullable(),
  repliedAt: time.nullable(),
  author: z.object({ id, displayName: z.string(), avatarUrl: z.url().nullable() }).nullable(),
  aircraft: z
    .object({ id, registration: z.string(), manufacturer: z.string(), model: z.string() })
    .nullable(),
});

export const bookingReviews = z.object({
  mine: review.nullable(),
  theirs: review.nullable().describe("The other side's, once published"),
  closesAt: time.nullable().describe("Reviews can be written until then"),
});

export function reviewDto(r: ReviewView): z.infer<typeof review> {
  return {
    id: r.id,
    bookingId: r.bookingId,
    direction: r.direction,
    overall: r.overall,
    scores: r.scores,
    comment: r.comment,
    submittedAt: r.submittedAt.toISOString(),
    publishedAt: r.publishedAt?.toISOString() ?? null,
    reply: r.reply,
    repliedAt: r.repliedAt?.toISOString() ?? null,
    author:
      r.authorId && r.author
        ? {
            id: r.authorId,
            displayName: r.author.name,
            avatarUrl: absoluteUrl(avatarUrl(r.author.avatarKey)),
          }
        : null,
    aircraft: r.aircraft,
  };
}

export function reviewSchemas() {
  return { Review: output(review), BookingReviews: output(bookingReviews) };
}

export function reviewPaths() {
  const booking = pathId("id", "Booking id (uuid)");
  return {
    "/api/v1/bookings/{id}/reviews": {
      get: {
        tags: ["reviews"],
        summary: "Your review of a completed booking and, once published, the other side's",
        security: signedIn,
        parameters: [booking],
        responses: { ...ok(ref("BookingReviews")), ...errors(401, 404) },
      },
      post: {
        tags: ["reviews"],
        summary: "Review a completed booking (double-blind until both reviewed or 14 days passed)",
        description:
          "409 with `details.reason`: `window_closed`, `already_reviewed`; 400 `bad_scores` when a category is missing or extra.",
        security: signedIn,
        parameters: [booking],
        requestBody: jsonBody(reviewBody),
        responses: { ...ok(ref("BookingReviews")), ...errors(400, 401, 404, 409) },
      },
    },
    "/api/v1/reviews/{id}/reply": {
      post: {
        tags: ["reviews"],
        summary: "The owner's one public reply to a review",
        security: signedIn,
        parameters: [pathId("id", "Review id (uuid)")],
        requestBody: jsonBody(replyBody),
        responses: { ...ok(ref("Review")), ...errors(400, 401, 404, 409) },
      },
    },
    "/api/v1/aircraft/{id}/reviews": {
      get: {
        tags: ["reviews"],
        summary: "Published reviews of an aircraft, newest first",
        parameters: [pathId("id", "Aircraft id (uuid)")],
        responses: { ...ok(ref("Review"), true), ...errors(404) },
      },
    },
  };
}
