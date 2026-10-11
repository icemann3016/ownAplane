import "server-only";

import { z } from "zod";

import { siteConfig } from "@/lib/site";
import { appUrl } from "@/lib/site-url";
import { LIMITS } from "./rate-limit";
import * as R from "./responses";
import {
  aircraftSearchQuery,
  airportQuery,
  acceptBody,
  bookingRequestBody,
  busyWindowQuery,
  cancelBody,
  checkoutBody,
  correctionBody,
  declineBody,
  legBody,
  remarkBody,
  startLogBody,
  upliftBody,
  periodQuery,
  pushAllBody,
  pushBusyBody,
  webhookBody,
} from "./schemas";

// The API's OpenAPI 3.1 description (API-5), built from the same Zod schemas the endpoints use
// for input and the DTOs return, so it can't drift. Served at /api/v1/openapi.json.

import {
  connectionKey,
  errors,
  type JsonSchema,
  jsonBody,
  ok,
  optionalSignIn,
  output,
  pathId,
  queryParameters,
  ref,
  signedIn,
} from "./openapi-helpers";
import { credentialSchemas, documentAndCredentialPaths } from "./openapi-credentials";
import { myAircraftPaths, myAircraftSchemas } from "./openapi-my-aircraft";
import { socialPaths, socialSchemas } from "./openapi-social";
import { reviewPaths, reviewSchemas } from "./reviews";
const takenExtras =
  "`title`, `type`, `status` and `registration` are optional and used only as the aircraft's owner chose; always sending them is fine.";

const booking = pathId("id", "Booking id (uuid)");
const logCreated = {
  description: "The flight log",
  content: {
    "application/json": { schema: { type: "object", properties: { data: ref("FlightLog") } } },
  },
};

/** A flight log change: answers with the whole log as it is now. */
function logOp(summary: string, body: z.ZodType | null, extra: JsonSchema[] = []) {
  return {
    tags: ["flight log"],
    summary,
    security: signedIn,
    parameters: [booking, ...extra],
    ...(body ? { requestBody: jsonBody(body) } : {}),
    responses: { ...ok(ref("FlightLog")), ...errors(400, 401, 404, 409) },
  };
}

export function openApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: `${siteConfig.name} API`,
      version: "1",
      description: [
        "REST API for the mobile app and partner systems (plan §4.9).",
        "",
        "**Sign in:** `POST /api/auth/sign-in/email` with `{ email, password }` and the header",
        "`Origin: ownaplane://app`. The token is in the `set-auth-token` response header; send it",
        "as `Authorization: Bearer <token>`. Sign out with `POST /api/auth/sign-out` (body `{}`), same two",
        'headers. The API ignores cookies; apps should not keep them (fetch `credentials: "omit"`).',
        "",
        "Times are ISO 8601 in UTC; quantities in SI units (litres, kg, minutes).",
        'Errors: `{ "error": { "code", "message", "fields"? } }` with the HTTP status.',
        "",
        `**Limits** per minute: ${LIMITS.user} per app token, ${LIMITS.partner} per partner API key,`,
        `${LIMITS.anonymous} per address without a token. Answers carry \`x-ratelimit-limit\`,`,
        "`x-ratelimit-remaining` and `x-ratelimit-reset`;",
        "over the limit: 429 `rate_limited` with `retry-after` (seconds).",
      ].join("\n"),
    },
    servers: [{ url: appUrl() }],
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", description: "A user's token from sign-in" },
        connectionKey: {
          type: "http",
          scheme: "bearer",
          description:
            "Calendar sync for partner systems: the API key (oap_…) the aircraft's owner created for your system under Aircraft → Calendar sync",
        },
      },
      schemas: {
        Error: output(R.errorBody),
        Me: output(R.me),
        Airport: output(R.airport),
        AircraftSummary: output(R.aircraftSummary),
        Aircraft: output(R.aircraftDetail),
        BookingSummary: output(R.bookingSummary),
        Booking: output(R.bookingDetail),
        SyncConnection: output(R.syncConnection),
        BusyTime: output(R.busyTime),
        PushResult: output(R.pushResult),
        PushAllResult: output(R.pushAllResult),
        FlightLog: output(R.flightLog),
        Eligibility: output(R.eligibility),
        BusyPeriod: output(R.busyPeriod),
        ...socialSchemas(),
        ...reviewSchemas(),
        ...credentialSchemas(),
        ...myAircraftSchemas(),
        WebhookEvent: output(R.webhookEvent),
        WebhookSettings: output(R.webhookSettings),
        WebhookSaved: output(R.webhookSaved),
        WebhookTest: output(R.webhookTest),
      },
    },
    webhooks: {
      busyChanged: {
        post: {
          summary: "A busy time of the aircraft was created, changed or removed in ownAplane",
          description:
            "Sent to the webhook address of a connected system (PUT /api/v1/sync/webhook), signed in the `ownaplane-signature` header. Answer 2xx within 8 seconds; otherwise we retry with growing pauses for about a day. Changes to the same busy time may be merged into one call with its current state.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: ref("WebhookEvent") } },
          },
          responses: { 200: { description: "Received" } },
        },
      },
    },
    paths: {
      "/api/auth/sign-in/email": {
        post: {
          tags: ["auth"],
          summary: "Sign in; the token is in the set-auth-token response header",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { email: { type: "string" }, password: { type: "string" } },
                  required: ["email", "password"],
                },
              },
            },
          },
          responses: {
            200: {
              description: "Signed in",
              headers: { "set-auth-token": { schema: { type: "string" } } },
            },
            401: { description: "Wrong email or password" },
          },
        },
      },
      "/api/auth/sign-out": {
        post: {
          tags: ["auth"],
          summary: "Sign out (revokes the token); the body is `{}`",
          security: signedIn,
          responses: { 200: { description: "Signed out" } },
        },
      },
      "/api/v1/me": {
        get: {
          tags: ["account"],
          summary: "The signed-in user",
          security: signedIn,
          responses: { ...ok(ref("Me")), ...errors(401) },
        },
      },
      "/api/v1/airports": {
        get: {
          tags: ["airports"],
          summary: "Search European airfields",
          parameters: queryParameters(airportQuery),
          responses: { ...ok(ref("Airport"), true), ...errors(400) },
        },
      },
      "/api/v1/airports/{ident}": {
        get: {
          tags: ["airports"],
          summary: "One airfield",
          parameters: [pathId("ident", "e.g. LBSF")],
          responses: { ...ok(ref("Airport")), ...errors(404) },
        },
      },
      "/api/v1/aircraft": {
        get: {
          tags: ["aircraft"],
          summary: "Search listed aircraft (a token adds `eligible`)",
          security: optionalSignIn,
          parameters: queryParameters(aircraftSearchQuery),
          responses: { ...ok(ref("AircraftSummary"), true), ...errors(400, 401, 404) },
        },
      },
      "/api/v1/aircraft/{id}": {
        get: {
          tags: ["aircraft"],
          summary: "A listed aircraft, or one of your own",
          security: optionalSignIn,
          parameters: [pathId("id", "Aircraft id (uuid)")],
          responses: { ...ok(ref("Aircraft")), ...errors(401, 404) },
        },
      },
      "/api/v1/aircraft/{id}/availability": {
        get: {
          tags: ["aircraft"],
          summary: "When the aircraft is busy (times and kinds only)",
          security: optionalSignIn,
          parameters: [pathId("id", "Aircraft id (uuid)"), ...queryParameters(periodQuery)],
          responses: { ...ok(ref("BusyPeriod"), true), ...errors(400, 404) },
        },
      },
      "/api/v1/aircraft/{id}/eligibility": {
        get: {
          tags: ["aircraft"],
          summary: "Can the signed-in pilot rent this aircraft (for these dates)?",
          description:
            "Without `from`/`to`, credentials are checked for today and night isn't. Each reason has a sentence in the user's language.",
          security: signedIn,
          parameters: [pathId("id", "Aircraft id (uuid)"), ...queryParameters(periodQuery)],
          responses: { ...ok(ref("Eligibility")), ...errors(400, 401, 404) },
        },
      },
      "/api/v1/bookings": {
        get: {
          tags: ["bookings"],
          summary: "Your bookings as pilot and owner, newest first",
          security: signedIn,
          responses: { ...ok(ref("BookingSummary"), true), ...errors(401) },
        },
        post: {
          tags: ["bookings"],
          summary: "Request a booking as the signed-in pilot",
          description:
            "201 with the booking (`requested`, or `accepted` with instant booking). 403 `forbidden` with `details.reasons` when the pilot doesn't meet the requirements; 409 `conflict` with `details.reason` (e.g. `not_free`); 400 with `fields` for invalid input (e.g. `lapl_passengers`).",
          security: signedIn,
          requestBody: jsonBody(bookingRequestBody),
          responses: {
            201: { description: "Requested", content: ok(ref("Booking"))[200].content },
            ...errors(400, 401, 403, 409),
          },
        },
      },
      "/api/v1/bookings/{id}": {
        get: {
          tags: ["bookings"],
          summary: "One of your bookings, with its history",
          security: signedIn,
          parameters: [pathId("id", "Booking id (uuid)")],
          responses: { ...ok(ref("Booking")), ...errors(401, 404) },
        },
      },
      "/api/v1/bookings/{id}/accept": {
        post: {
          tags: ["bookings"],
          summary: "The owner accepts a request (body optional: `{ note }`)",
          description:
            "409 `conflict` with `details.reason`: `not_open`, `pilot_not_eligible`, `aircraft_grounded` or `booked_elsewhere` (another connected system has the time).",
          security: signedIn,
          parameters: [pathId("id", "Booking id (uuid)")],
          requestBody: { ...jsonBody(acceptBody), required: false },
          responses: { ...ok(ref("Booking")), ...errors(401, 404, 409) },
        },
      },
      "/api/v1/bookings/{id}/decline": {
        post: {
          tags: ["bookings"],
          summary: "The owner declines, optionally suggesting another time",
          security: signedIn,
          parameters: [pathId("id", "Booking id (uuid)")],
          requestBody: { ...jsonBody(declineBody), required: false },
          responses: { ...ok(ref("Booking")), ...errors(400, 401, 404, 409) },
        },
      },
      "/api/v1/bookings/{id}/cancel": {
        post: {
          tags: ["bookings"],
          summary: "The pilot or owner cancels before the start, with a reason",
          description:
            "`details.late` is true when it was after the free-cancellation time of the owner's policy.",
          security: signedIn,
          parameters: [pathId("id", "Booking id (uuid)")],
          requestBody: jsonBody(cancelBody),
          responses: { ...ok(ref("Booking")), ...errors(400, 401, 404, 409) },
        },
      },
      "/api/v1/bookings/{id}/log": {
        get: {
          tags: ["flight log"],
          summary:
            "The rental's flight log: check-out, legs, fuel and oil, remarks, amount, checks",
          security: signedIn,
          parameters: [booking],
          responses: { ...ok(ref("FlightLog")), ...errors(401, 404) },
        },
        post: {
          tags: ["flight log"],
          summary: "Check-out: start the flight log (the pilot, from 2 hours before the start)",
          description:
            "409 with `details.reason`: `not_accepted`, `too_early`, `aircraft_grounded`; 400 `fields.recencyConfirmed` when the booking has passengers and FCL.060 isn't confirmed.",
          security: signedIn,
          parameters: [booking],
          requestBody: { ...jsonBody(startLogBody), required: false },
          responses: { 201: logCreated, ...errors(400, 401, 404, 409) },
        },
      },
      "/api/v1/bookings/{id}/log/checkout": {
        put: logOp("Readings found at check-out (litres)", checkoutBody),
      },
      "/api/v1/bookings/{id}/log/legs": {
        post: {
          ...logOp(
            "Add a leg; times in the order they happen (400 `details.reason: leg_order` with the fields to fix)",
            legBody,
          ),
          responses: { 201: logCreated, ...errors(400, 401, 404, 409) },
        },
      },
      "/api/v1/bookings/{id}/log/legs/{legId}": {
        put: logOp("Change a leg", legBody, [pathId("legId", "Leg id (uuid)")]),
        delete: logOp("Remove a leg", null, [pathId("legId", "Leg id (uuid)")]),
      },
      "/api/v1/bookings/{id}/log/uplifts": {
        post: {
          ...logOp(
            "Fuel or oil added (litres, price in the booking's currency, who paid)",
            upliftBody,
          ),
          responses: { 201: logCreated, ...errors(400, 401, 404, 409) },
        },
      },
      "/api/v1/bookings/{id}/log/uplifts/{upliftId}": {
        put: logOp("Change fuel or oil added", upliftBody, [
          pathId("upliftId", "Uplift id (uuid)"),
        ]),
        delete: logOp("Remove fuel or oil added", null, [pathId("upliftId", "Uplift id (uuid)")]),
      },
      "/api/v1/bookings/{id}/log/remarks": {
        post: {
          ...logOp("A remark or PIREP (aircraft, weather, airfield)", remarkBody),
          responses: { 201: logCreated, ...errors(400, 401, 404, 409) },
        },
      },
      "/api/v1/bookings/{id}/log/remarks/{remarkId}": {
        delete: logOp("Remove a remark", null, [pathId("remarkId", "Remark id (uuid)")]),
      },
      "/api/v1/bookings/{id}/log/submit": {
        post: logOp("Check-in: the pilot sends the log to the owner", null),
      },
      "/api/v1/bookings/{id}/log/correction": {
        post: logOp("The owner asks for a correction, with a note", correctionBody),
      },
      "/api/v1/bookings/{id}/log/confirm": {
        post: logOp(
          "The owner confirms; the amount is worked out on the server and the booking completed",
          null,
        ),
      },
      ...socialPaths(),
      ...reviewPaths(),
      ...documentAndCredentialPaths(),
      ...myAircraftPaths(),
      "/api/v1/sync": {
        get: {
          tags: ["calendar sync"],
          summary: "Which connection and aircraft your API key belongs to",
          security: connectionKey,
          responses: { ...ok(ref("SyncConnection")), ...errors(401) },
        },
      },
      "/api/v1/sync/busy": {
        get: {
          tags: ["calendar sync"],
          summary: "When the aircraft is busy in ownAplane (without your own busy times)",
          description:
            "Check this before you confirm a booking in your system. Fields besides `from`, `to` and `kind` appear only when the aircraft's owner shares them with your system.",
          security: connectionKey,
          parameters: queryParameters(busyWindowQuery),
          responses: { ...ok(ref("BusyTime"), true), ...errors(400, 401) },
        },
        put: {
          tags: ["calendar sync"],
          summary: "Replace all your busy times (a full snapshot); missing ones are removed",
          description: takenExtras,
          security: connectionKey,
          requestBody: jsonBody(pushAllBody),
          responses: { ...ok(ref("PushAllResult")), ...errors(400, 401) },
        },
      },
      "/api/v1/sync/busy/{externalId}": {
        put: {
          tags: ["calendar sync"],
          summary: "Create or move one of your bookings",
          description:
            "409 `conflict` when it overlaps an ownAplane booking: it is still recorded and the owner is asked to resolve it (`error.details.recorded`). 400 with `fields.registration` when it is for another aircraft and the owner checks registrations. " +
            takenExtras,
          security: connectionKey,
          parameters: [pathId("externalId", "Your system's id of the booking")],
          requestBody: jsonBody(pushBusyBody),
          responses: { ...ok(ref("PushResult")), ...errors(400, 401, 409) },
        },
        delete: {
          tags: ["calendar sync"],
          summary: "Your booking was cancelled: the time is free again",
          security: connectionKey,
          parameters: [pathId("externalId", "Your system's id of the booking")],
          responses: { 200: { description: "Deleted" }, ...errors(401, 404) },
        },
      },
      "/api/v1/sync/webhook": {
        get: {
          tags: ["calendar sync"],
          summary: "Where we send changes to our busy times, and how the last call went",
          security: connectionKey,
          responses: { ...ok(ref("WebhookSettings")), ...errors(401) },
        },
        put: {
          tags: ["calendar sync"],
          summary: "Send changes to this address (see webhooks: busyChanged)",
          description:
            'The first call (or `newSecret: true`) returns a signing secret, once. Every call we make carries `ownaplane-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`.',
          security: connectionKey,
          requestBody: jsonBody(webhookBody),
          responses: { ...ok(ref("WebhookSaved")), ...errors(400, 401) },
        },
        delete: {
          tags: ["calendar sync"],
          summary: "Stop sending changes",
          security: connectionKey,
          responses: { 200: { description: "Removed" }, ...errors(401) },
        },
      },
      "/api/v1/sync/webhook/test": {
        post: {
          tags: ["calendar sync"],
          summary: "We send a signed `ping` to your webhook now and say how it went",
          security: connectionKey,
          responses: { ...ok(ref("WebhookTest")), ...errors(401) },
        },
      },
      "/api/v1/calendars/{token}.ics": {
        get: {
          tags: ["calendar sync"],
          summary: "Our busy times for one connected system as an iCal feed (subscribe to it)",
          description:
            "The link is shown to the owner under Calendar sync; the token is the secret.",
          parameters: [pathId("token", "The secret part of the link")],
          responses: {
            200: { description: "iCal calendar", content: { "text/calendar": {} } },
            ...errors(404),
          },
        },
      },
    },
  };
}
