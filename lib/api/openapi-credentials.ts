import type { z } from "zod";

import {
  credentials,
  experienceBody,
  licenceBody,
  medicalBody,
  ratingBody,
  typeHoursBody,
} from "./credentials";
import { errors, jsonBody, ok, output, pathId, ref, signedIn } from "./openapi-helpers";

// OpenAPI paths of private documents and pilot credentials (lib/api/credentials.ts).

export function credentialSchemas() {
  return { Credentials: output(credentials) };
}

const all = (status = 200) => ({
  [status]: {
    description: "All your credentials as they are now",
    content: {
      "application/json": {
        schema: { type: "object", properties: { data: ref("Credentials") } },
      },
    },
  },
});

const create = (what: string, body: z.ZodType) => ({
  post: {
    tags: ["credentials"],
    summary: `Add a ${what}; an admin then verifies it`,
    security: signedIn,
    requestBody: jsonBody(body),
    responses: { ...all(201), ...errors(400, 401) },
  },
});

const change = (body: z.ZodType) => ({
  put: {
    tags: ["credentials"],
    summary: "Change it (send all fields); a verified item goes back to pending",
    security: signedIn,
    parameters: [pathId("id", "Credential id (uuid)")],
    requestBody: jsonBody(body),
    responses: { ...all(), ...errors(400, 401, 404) },
  },
  delete: {
    tags: ["credentials"],
    summary: "Remove it and its scan",
    security: signedIn,
    parameters: [pathId("id", "Credential id (uuid)")],
    responses: { ...all(), ...errors(401, 404) },
  },
});

export function documentAndCredentialPaths() {
  return {
    "/api/v1/documents": {
      post: {
        tags: ["documents"],
        summary:
          "Upload a private document (licence or medical scan, check-out photo, receipt) and use its id",
        security: signedIn,
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description: "PDF, JPEG, PNG or WebP, at most 4 MB",
                  },
                },
                required: ["file"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Stored; removed after a day unless something refers to it",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string", format: "uuid" },
                        filename: { type: "string" },
                        sizeBytes: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          ...errors(400, 401, 409, 413),
        },
      },
    },
    "/api/v1/documents/{id}": {
      get: {
        tags: ["documents"],
        summary: "The file (yours, or a flight log photo or receipt of your booking); ?download",
        security: signedIn,
        parameters: [pathId("id", "Document id (uuid)")],
        responses: {
          200: { description: "The file with its content type" },
          ...errors(401, 404),
        },
      },
    },
    "/api/v1/me/credentials": {
      get: {
        tags: ["credentials"],
        summary: "Your licences, ratings, medicals and experience with their review status",
        security: signedIn,
        responses: { ...ok(ref("Credentials")), ...errors(401) },
      },
    },
    "/api/v1/me/credentials/licences": create("licence", licenceBody),
    "/api/v1/me/credentials/licences/{id}": change(licenceBody),
    "/api/v1/me/credentials/ratings": create("rating", ratingBody),
    "/api/v1/me/credentials/ratings/{id}": change(ratingBody),
    "/api/v1/me/credentials/medicals": create("medical certificate", medicalBody),
    "/api/v1/me/credentials/medicals/{id}": change(medicalBody),
    "/api/v1/me/credentials/experience": {
      put: {
        tags: ["credentials"],
        summary: "Total, PIC and last-90-days hours; date of birth (optional)",
        security: signedIn,
        requestBody: jsonBody(experienceBody),
        responses: { ...all(), ...errors(400, 401) },
      },
    },
    "/api/v1/me/credentials/type-hours/{aircraftType}": {
      put: {
        tags: ["credentials"],
        summary: "Hours on an aircraft type",
        security: signedIn,
        parameters: [pathId("aircraftType", "ICAO type designator, e.g. C172")],
        requestBody: jsonBody(typeHoursBody),
        responses: { ...all(), ...errors(400, 401, 404) },
      },
      delete: {
        tags: ["credentials"],
        summary: "Remove the hours on that type",
        security: signedIn,
        parameters: [pathId("aircraftType", "ICAO type designator")],
        responses: { ...all(), ...errors(401, 404) },
      },
    },
  };
}
