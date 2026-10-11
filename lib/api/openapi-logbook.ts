import {
  certifyBody,
  logbookEntry,
  logbookEntryBody,
  logbookTotals,
  newLogbookEntryBody,
  pageQuery,
  voidBody,
} from "./logbook";
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

// OpenAPI paths of the pilot's logbook (lib/api/logbook.ts).

export function logbookSchemas() {
  return { LogbookEntry: output(logbookEntry), LogbookTotals: output(logbookTotals) };
}

const tags = ["logbook"];
const id = pathId("id", "Logbook entry id (uuid)");
const entry = (status = 200) => ({
  [status]: {
    description: "The entry as it is now",
    content: {
      "application/json": { schema: { type: "object", properties: { data: ref("LogbookEntry") } } },
    },
  },
});

export function logbookPaths() {
  return {
    "/api/v1/me/logbook": {
      get: {
        tags,
        summary: "Your logbook entries, newest first, 50 a page",
        security: signedIn,
        parameters: queryParameters(pageQuery),
        responses: { ...ok(ref("LogbookEntry"), true), ...errors(400, 401) },
      },
      post: {
        tags,
        summary:
          "A new draft (flight, fstd, brought_forward); with correctsId a correction of a certified entry",
        security: signedIn,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                allOf: [
                  jsonBody(logbookEntryBody).content["application/json"].schema,
                  jsonBody(newLogbookEntryBody).content["application/json"].schema,
                ],
              },
            },
          },
        },
        responses: { ...entry(201), ...errors(400, 401) },
      },
    },
    "/api/v1/me/logbook/{id}": {
      get: {
        tags,
        summary: "One entry with its history (what it corrects) and what corrected it",
        security: signedIn,
        parameters: [id],
        responses: { ...entry(), ...errors(401, 404) },
      },
      put: {
        tags,
        summary: "Change a draft (send all fields); 409 not_editable once certified",
        security: signedIn,
        parameters: [id],
        requestBody: jsonBody(logbookEntryBody),
        responses: { ...entry(), ...errors(400, 401, 404, 409) },
      },
      delete: {
        tags,
        summary: "Delete a draft; certified entries are struck through instead",
        security: signedIn,
        parameters: [id],
        responses: { 200: { description: "Deleted" }, ...errors(401, 404, 409) },
      },
    },
    "/api/v1/me/logbook/{id}/void": {
      post: {
        tags,
        summary: "Strike a certified entry through, with the reason; it stays visible",
        security: signedIn,
        parameters: [id],
        requestBody: jsonBody(voidBody),
        responses: { ...entry(), ...errors(400, 401, 404) },
      },
    },
    "/api/v1/me/logbook/certify": {
      post: {
        tags,
        summary: "Certify drafts, all or nothing (409 incomplete with details.incomplete)",
        security: signedIn,
        requestBody: jsonBody(certifyBody),
        responses: { 200: { description: "{ data: { certified } }" }, ...errors(400, 401, 409) },
      },
    },
    "/api/v1/me/logbook/totals": {
      get: {
        tags,
        summary: "Totals per column to date, the last 90 days, and hours per aircraft type",
        security: signedIn,
        responses: { ...ok(ref("LogbookTotals")), ...errors(401) },
      },
    },
    "/api/v1/me/logbook/export": {
      get: {
        tags,
        summary: "Certified and struck-through entries as CSV in the EASA column order",
        security: signedIn,
        responses: { 200: { description: "text/csv" }, ...errors(401) },
      },
    },
  };
}
