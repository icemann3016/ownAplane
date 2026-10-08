import "server-only";

import { z } from "zod";

import { siteConfig } from "@/lib/site";
import { appUrl } from "@/lib/site-url";
import * as R from "./responses";
import { aircraftSearchQuery, airportQuery } from "./schemas";

// The API's OpenAPI 3.1 description (API-5), built from the same Zod schemas the endpoints use
// for input and the DTOs return, so it can't drift. Served at /api/v1/openapi.json.

type JsonSchema = Record<string, unknown>;

const output = (schema: z.ZodType) => z.toJSONSchema(schema, { io: "output" }) as JsonSchema;

/** Query schema → OpenAPI query parameters. */
function queryParameters(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as {
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };
  return Object.entries(json.properties ?? {}).map(([name, s]) => ({
    name,
    in: "query",
    required: json.required?.includes(name) ?? false,
    description: s.description,
    schema: s,
  }));
}

const pathId = (name: string, description: string) => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string" },
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ok = (data: JsonSchema, list = false) => ({
  200: {
    description: "OK",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: list
            ? { data: { type: "array", items: data }, nextCursor: { type: ["string", "null"] } }
            : { data },
          required: ["data"],
        },
      },
    },
  },
});
const errors = (...codes: number[]) =>
  Object.fromEntries(
    codes.map((code) => [
      code,
      { description: "Error", content: { "application/json": { schema: ref("Error") } } },
    ]),
  );
const signedIn = [{ bearer: [] }];
const optionalSignIn = [{}, { bearer: [] }];

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
      ].join("\n"),
    },
    servers: [{ url: appUrl() }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
      schemas: {
        Error: output(R.errorBody),
        Me: output(R.me),
        Airport: output(R.airport),
        AircraftSummary: output(R.aircraftSummary),
        Aircraft: output(R.aircraftDetail),
        BookingSummary: output(R.bookingSummary),
        Booking: output(R.bookingDetail),
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
      "/api/v1/bookings": {
        get: {
          tags: ["bookings"],
          summary: "Your bookings as pilot and owner, newest first",
          security: signedIn,
          responses: { ...ok(ref("BookingSummary"), true), ...errors(401) },
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
    },
  };
}
