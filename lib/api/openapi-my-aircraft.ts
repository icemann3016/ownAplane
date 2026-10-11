import {
  aircraftDocumentBody,
  createAircraftBody,
  photoOrderBody,
  requirementsBody,
  statusBody,
  updateAircraftBody,
} from "./my-aircraft";
import { myAircraft, myAircraftSummary } from "./my-aircraft-dto";
import { errors, jsonBody, ok, output, pathId, ref, signedIn } from "./openapi-helpers";

// OpenAPI paths of an owner's aircraft (lib/api/my-aircraft.ts).

export function myAircraftSchemas() {
  return { MyAircraftSummary: output(myAircraftSummary), MyAircraft: output(myAircraft) };
}

const id = pathId("id", "Aircraft id (uuid)");
const tags = ["my aircraft"];
const aircraft = (status = 200) => ({
  [status]: {
    description: "The aircraft as it is now",
    content: {
      "application/json": { schema: { type: "object", properties: { data: ref("MyAircraft") } } },
    },
  },
});
const multipartFile = (description: string) => ({
  required: true,
  content: {
    "multipart/form-data": {
      schema: {
        type: "object",
        properties: { file: { type: "string", format: "binary", description } },
        required: ["file"],
      },
    },
  },
});

export function myAircraftPaths() {
  return {
    "/api/v1/me/aircraft": {
      get: {
        tags,
        summary: "Your aircraft, newest first, with what still stops each listing",
        security: signedIn,
        responses: { ...ok(ref("MyAircraftSummary"), true), ...errors(401) },
      },
      post: {
        tags,
        summary: "A new draft (owners only); then add the base, price, photos and documents",
        security: signedIn,
        requestBody: jsonBody(createAircraftBody),
        responses: { ...aircraft(201), ...errors(400, 401, 403) },
      },
    },
    "/api/v1/me/aircraft/{id}": {
      get: {
        tags,
        summary: "Everything about one of your aircraft",
        security: signedIn,
        parameters: [id],
        responses: { ...aircraft(), ...errors(401, 404) },
      },
      patch: {
        tags,
        summary:
          "Change any fields (SI units: litres, kg); 400 registration_taken, unknown_airfield",
        security: signedIn,
        parameters: [id],
        requestBody: jsonBody(updateAircraftBody),
        responses: { ...aircraft(), ...errors(400, 401, 404) },
      },
      delete: {
        tags,
        summary:
          "Delete it with its photos and documents (409 has_bookings while bookings are open)",
        security: signedIn,
        parameters: [id],
        responses: { 200: { description: "Deleted" }, ...errors(401, 404, 409) },
      },
    },
    "/api/v1/me/aircraft/{id}/status": {
      put: {
        tags,
        summary:
          "List, pause or unlist (409 not_ready with details.missing, plan_limit with details.limit, blocked, not_allowed)",
        security: signedIn,
        parameters: [id],
        requestBody: jsonBody(statusBody),
        responses: { ...aircraft(), ...errors(400, 401, 404, 409) },
      },
    },
    "/api/v1/me/aircraft/{id}/requirements": {
      put: {
        tags,
        summary: "Who may rent it (send all fields)",
        security: signedIn,
        parameters: [id],
        requestBody: jsonBody(requirementsBody),
        responses: { ...aircraft(), ...errors(400, 401, 404) },
      },
    },
    "/api/v1/me/aircraft/{id}/photos": {
      post: {
        tags,
        summary: "Add a photo (last in order; at most 20)",
        security: signedIn,
        parameters: [id],
        requestBody: multipartFile("JPEG, PNG or WebP, at most 4 MB"),
        responses: { ...aircraft(201), ...errors(400, 401, 404, 409, 413) },
      },
    },
    "/api/v1/me/aircraft/{id}/photos/order": {
      put: {
        tags,
        summary: "The photos' order, cover first",
        security: signedIn,
        parameters: [id],
        requestBody: jsonBody(photoOrderBody),
        responses: { ...aircraft(), ...errors(400, 401, 404) },
      },
    },
    "/api/v1/me/aircraft/{id}/photos/{photoId}": {
      delete: {
        tags,
        summary: "Remove a photo (409 last_photo for a listed aircraft)",
        security: signedIn,
        parameters: [id, pathId("photoId", "Photo id (uuid)")],
        responses: { ...aircraft(), ...errors(401, 404, 409) },
      },
    },
    "/api/v1/me/aircraft/{id}/documents": {
      post: {
        tags,
        summary: "Add CofA, ARC, insurance (checked by an admin) or a reference document",
        security: signedIn,
        parameters: [id],
        requestBody: jsonBody(aircraftDocumentBody),
        responses: { ...aircraft(201), ...errors(400, 401, 404) },
      },
    },
    "/api/v1/me/aircraft/{id}/documents/{documentId}": {
      put: {
        tags,
        summary: "Change its title, expiry or file (409 add_renewal when listing depends on it)",
        security: signedIn,
        parameters: [id, pathId("documentId", "Aircraft document id (uuid)")],
        requestBody: jsonBody(aircraftDocumentBody),
        responses: { ...aircraft(), ...errors(400, 401, 404, 409) },
      },
      delete: {
        tags,
        summary: "Remove it (409 cant_delete_listed)",
        security: signedIn,
        parameters: [id, pathId("documentId", "Aircraft document id (uuid)")],
        responses: { ...aircraft(), ...errors(401, 404, 409) },
      },
    },
  };
}
