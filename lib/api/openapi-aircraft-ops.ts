import {
  calendarBlockBody,
  calendarEntry,
  calendarWindowQuery,
  defect,
  defectBody,
  knownItemBody,
  meterReading,
  meterReadingBody,
  remark,
  resolveBody,
} from "./aircraft-ops";
import {
  errors,
  jsonBody,
  ok,
  output,
  pathId,
  queryParameters,
  ref,
  signedIn,
} from "./openapi-helpers";

// OpenAPI paths of an owner's day-to-day operations (lib/api/aircraft-ops.ts).

export function aircraftOpsSchemas() {
  return {
    CalendarEntry: output(calendarEntry),
    Defect: output(defect),
    Remark: output(remark),
    MeterReading: output(meterReading),
  };
}

const id = pathId("id", "Aircraft id (uuid)");
const tags = ["my aircraft"];
const created = (schema: string) => ({
  201: {
    description: "Created",
    content: {
      "application/json": { schema: { type: "object", properties: { data: ref(schema) } } },
    },
  },
});
const removed = { 200: { description: "Removed" } };

export function aircraftOpsPaths() {
  return {
    "/api/v1/me/aircraft/{id}/calendar": {
      get: {
        tags,
        summary: "Bookings, your blocks and busy times from connected systems (default 60 days)",
        security: signedIn,
        parameters: [id, ...queryParameters(calendarWindowQuery)],
        responses: { ...ok(ref("CalendarEntry"), true), ...errors(400, 401, 404) },
      },
      post: {
        tags,
        summary: "Block time (own use or maintenance); 409 overlaps",
        security: signedIn,
        parameters: [id],
        requestBody: jsonBody(calendarBlockBody),
        responses: { ...created("CalendarEntry"), ...errors(400, 401, 404, 409) },
      },
    },
    "/api/v1/me/aircraft/{id}/calendar/{entryId}": {
      delete: {
        tags,
        summary: "Remove a block",
        security: signedIn,
        parameters: [id, pathId("entryId", "Calendar entry id (uuid)")],
        responses: { ...removed, ...errors(401, 404) },
      },
    },
    "/api/v1/me/aircraft/{id}/ground": {
      post: {
        tags,
        summary: "Ground it: no requests, acceptances or check-outs until you list it again",
        security: signedIn,
        parameters: [id],
        responses: { ...ok(ref("MyAircraft")), ...errors(401, 404, 409) },
      },
    },
    "/api/v1/me/aircraft/{id}/defects": {
      get: {
        tags,
        summary: "Reported defects, newest first",
        security: signedIn,
        parameters: [id],
        responses: { ...ok(ref("Defect"), true), ...errors(401, 404) },
      },
      post: {
        tags,
        summary: "Record a defect yourself",
        security: signedIn,
        parameters: [id],
        requestBody: jsonBody(defectBody),
        responses: { ...created("Defect"), ...errors(400, 401, 404) },
      },
    },
    "/api/v1/me/aircraft/{id}/defects/{defectId}/resolve": {
      post: {
        tags,
        summary: "Mark it fixed, with what was done",
        security: signedIn,
        parameters: [id, pathId("defectId", "Defect id (uuid)")],
        requestBody: jsonBody(resolveBody),
        responses: { ...ok(ref("Defect")), ...errors(400, 401, 404, 409) },
      },
    },
    "/api/v1/me/aircraft/{id}/remarks": {
      get: {
        tags,
        summary: "Pilots' remarks from flight logs, newest first",
        security: signedIn,
        parameters: [id],
        responses: { ...ok(ref("Remark"), true), ...errors(401, 404) },
      },
    },
    "/api/v1/me/aircraft/{id}/remarks/{remarkId}": {
      put: {
        tags,
        summary: "Make an aircraft remark a known item, or mark it fixed",
        security: signedIn,
        parameters: [id, pathId("remarkId", "Remark id (uuid)")],
        requestBody: jsonBody(knownItemBody),
        responses: { ...ok(ref("Remark")), ...errors(400, 401, 404, 409) },
      },
    },
    "/api/v1/me/aircraft/{id}/meter-readings": {
      get: {
        tags,
        summary: "The latest 50 meter readings you recorded",
        security: signedIn,
        parameters: [id],
        responses: { ...ok(ref("MeterReading"), true), ...errors(401, 404) },
      },
      post: {
        tags,
        summary: "Record Hobbs/tach between rentals (the next check-out is compared with it)",
        security: signedIn,
        parameters: [id],
        requestBody: jsonBody(meterReadingBody),
        responses: { ...created("MeterReading"), ...errors(400, 401, 404) },
      },
    },
    "/api/v1/me/aircraft/{id}/meter-readings/{readingId}": {
      delete: {
        tags,
        summary: "Remove a reading recorded by mistake",
        security: signedIn,
        parameters: [id, pathId("readingId", "Meter reading id (uuid)")],
        responses: { ...removed, ...errors(401, 404) },
      },
    },
    "/api/v1/bookings/{id}/defects": {
      post: {
        tags: ["bookings"],
        summary: "Report a defect during or after a rental (pilot or owner); the owner is emailed",
        security: signedIn,
        parameters: [pathId("id", "Booking id (uuid)")],
        requestBody: jsonBody(defectBody),
        responses: {
          201: { description: "Reported: { data: { id } }" },
          ...errors(400, 401, 404, 409),
        },
      },
    },
  };
}
