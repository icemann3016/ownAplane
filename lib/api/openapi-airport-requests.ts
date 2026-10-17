import "server-only";

import {
  airfieldMovement,
  airfieldServices,
  airportRequest,
  airportRequestBody,
  airportRequestSummary,
  movementsQuery,
  myAirfield,
  requestAnswerBody,
} from "./airport-requests";
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

// OpenAPI of pilots' requests to airfields and the airfields' movements (APT-2…7).

export function airportRequestSchemas() {
  return {
    AirfieldServices: output(airfieldServices),
    AirportRequestSummary: output(airportRequestSummary),
    AirportRequest: output(airportRequest),
    AirfieldMovement: output(airfieldMovement),
    MyAirfield: output(myAirfield),
  };
}

const created = {
  201: {
    description: "Sent",
    content: {
      "application/json": {
        schema: { type: "object", properties: { data: ref("AirportRequest") } },
      },
    },
  },
};

export function airportRequestPaths() {
  const request = pathId("id", "Request id (uuid)");
  const airfield = pathId("ident", "Airfield ident, e.g. LBSF");
  const tags = ["airfield requests"];
  return {
    "/api/v1/airports/{ident}/services": {
      get: {
        tags,
        summary: "An airfield's services and prices, to pick from in a request",
        description: "Only airfields on ownAplane (with a verified team); 404 for the others.",
        parameters: [airfield],
        responses: { ...ok(ref("AirfieldServices")), ...errors(404) },
      },
    },
    "/api/v1/airport-requests": {
      get: {
        tags,
        summary: "Your requests to airfields as a pilot, the latest trip first",
        security: signedIn,
        responses: { ...ok(ref("AirportRequestSummary"), true), ...errors(401) },
      },
      post: {
        tags,
        summary: "Ask an airfield for an arrival and/or departure, with services from its list",
        description: [
          "Pilots only: 403 with `details.reason` `not_pilot` (airfield accounts aren't pilot accounts).",
          "Airfields that require PPR answer (`status` `pending`); the others confirm at once",
          "(`approved`, `autoConfirmed`). Prices are copied from the airfield's list when sent.",
          "404 when the airfield isn't on ownAplane; 400 with `details.reason`: `unknown_service`",
          "(not on this airfield's list), `unknown_airfield` (`arrival.from`, `departure.to`),",
          "`booking_not_yours`, `in_the_past`; 429 `too_many_requests` after 20 a day.",
        ].join(" "),
        security: signedIn,
        requestBody: jsonBody(airportRequestBody),
        responses: { ...created, ...errors(400, 401, 403, 404, 429) },
      },
    },
    "/api/v1/airport-requests/{id}": {
      get: {
        tags,
        summary: "One request, for its pilot or the airfield's team, with warnings",
        security: signedIn,
        parameters: [request],
        responses: { ...ok(ref("AirportRequest")), ...errors(401, 404) },
      },
    },
    "/api/v1/airport-requests/{id}/cancel": {
      post: {
        tags,
        summary: "The pilot cancels a pending or approved request",
        description:
          "403 `not_allowed` for anyone but its pilot; 409 `request_closed` once declined or cancelled.",
        security: signedIn,
        parameters: [request],
        responses: { ...ok(ref("AirportRequest")), ...errors(401, 403, 404, 409) },
      },
    },
    "/api/v1/airport-requests/{id}/answer": {
      post: {
        tags,
        summary: "The airfield's team approves (PPR number, conditions) or declines",
        description:
          "Managers and staff of the airfield; the pilot is told. 403 `not_allowed` for anyone else; 409 `request_closed` once cancelled. An auto-confirmed request can still be declined.",
        security: signedIn,
        parameters: [request],
        requestBody: jsonBody(requestAnswerBody),
        responses: { ...ok(ref("AirportRequest")), ...errors(400, 401, 403, 404, 409) },
      },
    },
    "/api/v1/me/airports": {
      get: {
        tags,
        summary: "The airfields whose team you're on, with today's movements",
        security: signedIn,
        responses: { ...ok(ref("MyAirfield"), true), ...errors(401) },
      },
    },
    "/api/v1/me/airports/{ident}/movements": {
      get: {
        tags,
        summary: "The airfield's movements board: requests arriving or departing in a period",
        description:
          "For its team. Requests arriving, departing or on the ground between `from` and `to`, earliest first; cancelled ones are left out.",
        security: signedIn,
        parameters: [airfield, ...queryParameters(movementsQuery)],
        responses: { ...ok(ref("AirfieldMovement"), true), ...errors(400, 401, 404) },
      },
    },
  };
}
