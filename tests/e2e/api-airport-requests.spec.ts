import { expect, test } from "@playwright/test";

import { apiSignIn, seedAirfield, signUp, unique, withDb } from "./helpers";

// Requests to airfields through the API (APT-2…7): a pilot picks services from the airfield's
// public list and sends a request; the airfield's team sees it on its movements board and
// answers; the pilot cancels. Airfields without PPR confirm at once.
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

/** An ISO instant `hours` from now, to the minute. */
const inHours = (hours: number) =>
  new Date(Math.floor(Date.now() / 60_000 + hours * 60) * 60_000).toISOString();

test("a pilot asks an airfield through the API and its team answers", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const id = unique();
  const short = id
    .replace(/[^a-z0-9]/gi, "")
    .slice(-6)
    .toUpperCase();
  const ident = `ZA-${short}`;
  const open = `ZO-${short}`;
  const managerEmail = `api-apt-${id}@example.com`;
  const pilotEmail = `api-apt-pilot-${id}@example.com`;
  for (const [name, email] of [
    [`Manager ${id}`, managerEmail],
    [`Pilot ${id}`, pilotEmail],
  ] as const) {
    const context = await browser.newContext();
    await signUp(await context.newPage(), name, email);
    await context.close();
  }
  await seedAirfield(ident, `Ridge ${id}`, managerEmail, true);
  await seedAirfield(open, `Valley ${id}`, managerEmail, false);
  await withDb(
    (sql) => sql`insert into user_roles (user_id, role)
      select id, 'pilot' from users where email = ${pilotEmail}`,
  );
  const pilot = `Bearer ${await apiSignIn(baseURL, pilotEmail)}`;
  const manager = `Bearer ${await apiSignIn(baseURL, managerEmail)}`;
  const call = (route: string, init: { method?: string; body?: unknown; auth?: string } = {}) =>
    fetch(new URL(route, baseURL), {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        ...(init.auth ? { authorization: init.auth } : {}),
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

  // 1. The airfield's services and prices are public, like its page
  const listed = await call(`/api/v1/airports/${ident}/services`);
  expect(listed.status).toBe(200);
  const { data: airfield } = await listed.json();
  expect(airfield).toMatchObject({
    airport: { ident, code: ident },
    currency: "EUR",
    pprRequired: true,
    pprNoticeHours: 2,
  });
  const service = (category: string, maxMtomKg: number | null = null) =>
    airfield.services.find(
      (s: { category: string; maxMtomKg: number | null }) =>
        s.category === category && s.maxMtomKg === maxMtomKg,
    ).id as string;
  expect((await call("/api/v1/airports/LBSF/services")).status).toBe(404);

  // 2. Only pilots send requests, with an arrival or a departure from known airfields
  const trip = {
    airport: ident,
    registration: "lz-abc",
    aircraftType: "c172",
    mtomKg: 1157,
    arrival: { at: inHours(4), from: "LBSF" },
    departure: { at: inHours(28), to: "LBSF" },
    pob: 2,
    other: "Taxi to town, please",
    services: [
      { serviceId: service("landing", 2000), quantity: 1 },
      { serviceId: service("fuel"), quantity: 80 },
      { serviceId: service("customs"), quantity: 1 },
    ],
  };
  const notPilot = await call("/api/v1/airport-requests", { auth: manager, body: trip });
  expect(notPilot.status).toBe(403);
  expect((await notPilot.json()).error.details.reason).toBe("not_pilot");
  const noTimes = await call("/api/v1/airport-requests", {
    auth: pilot,
    body: { ...trip, arrival: null, departure: null },
  });
  expect(noTimes.status).toBe(400);
  expect((await noTimes.json()).error.fields.arrival).toEqual(["arrivalOrDeparture"]);
  const nowhere = await call("/api/v1/airport-requests", {
    auth: pilot,
    body: { ...trip, arrival: { at: inHours(4), from: "ZZZZ-NOWHERE" } },
  });
  expect(nowhere.status).toBe(400);
  expect((await nowhere.json()).error.fields.arrival).toEqual(["airportUnknown"]);
  const elsewhere = await call("/api/v1/airport-requests", {
    auth: pilot,
    body: { ...trip, airport: open },
  });
  expect(elsewhere.status).toBe(400);
  expect((await elsewhere.json()).error.details.reason).toBe("unknown_service");

  // 3. Sent: waiting for the airfield, with the airfield's prices and a rough total
  const sent = await call("/api/v1/airport-requests", { auth: pilot, body: trip });
  expect(sent.status).toBe(201);
  const { data: request } = await sent.json();
  expect(request).toMatchObject({
    status: "pending",
    autoConfirmed: false,
    yourRole: "pilot",
    registration: "LZ-ABC",
    aircraftType: "C172",
    airport: { ident },
    arrival: { at: trip.arrival.at, from: { ident: "LBSF" } },
    currency: "EUR",
    estimate: { total: 253.72, onRequest: 1 },
    other: "Taxi to town, please",
    pilot: { displayName: `Pilot ${id}` },
  });
  expect(request.services).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ category: "fuel", price: 2.859, quantity: 80 }),
      expect.objectContaining({ category: "customs", price: null }),
    ]),
  );
  expect(Array.isArray(request.warnings)).toBe(true);
  const mine = await (await call("/api/v1/airport-requests", { auth: pilot })).json();
  expect(mine.data[0]).toMatchObject({ id: request.id, status: "pending", airport: { ident } });

  // 4. The team sees its airfields and the movements board
  const airfields = await (await call("/api/v1/me/airports", { auth: manager })).json();
  expect(airfields.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ airport: expect.objectContaining({ ident }), role: "manager" }),
    ]),
  );
  const range = `from=${encodeURIComponent(inHours(0))}&to=${encodeURIComponent(inHours(48))}`;
  const board = await call(`/api/v1/me/airports/${ident}/movements?${range}`, { auth: manager });
  expect(board.status).toBe(200);
  const { data: movements } = await board.json();
  expect(movements).toEqual([
    expect.objectContaining({ id: request.id, registration: "LZ-ABC", pob: 2 }),
  ]);
  const tooLong = `from=${encodeURIComponent(inHours(0))}&to=${encodeURIComponent(inHours(24 * 70))}`;
  expect(
    (await call(`/api/v1/me/airports/${ident}/movements?${tooLong}`, { auth: manager })).status,
  ).toBe(400);
  expect(
    (await call(`/api/v1/me/airports/${ident}/movements?${range}`, { auth: pilot })).status,
  ).toBe(404);

  // 5. The team answers; the pilot can't
  const answer = { decision: "approve", pprNumber: "PPR-9", conditions: "After 10:00 UTC" };
  const byPilot = await call(`/api/v1/airport-requests/${request.id}/answer`, {
    auth: pilot,
    body: answer,
  });
  expect(byPilot.status).toBe(403);
  const approved = await call(`/api/v1/airport-requests/${request.id}/answer`, {
    auth: manager,
    body: answer,
  });
  expect(approved.status).toBe(200);
  expect((await approved.json()).data).toMatchObject({
    status: "approved",
    pprNumber: "PPR-9",
    conditions: "After 10:00 UTC",
    yourRole: "manager",
    bookingId: null,
  });
  const seen = await (await call(`/api/v1/airport-requests/${request.id}`, { auth: pilot })).json();
  expect(seen.data).toMatchObject({ status: "approved", answeredBy: `Manager ${id}` });

  // 6. The pilot cancels; then it's closed
  expect(
    (await call(`/api/v1/airport-requests/${request.id}/cancel`, { method: "POST", auth: manager }))
      .status,
  ).toBe(403);
  const cancelled = await call(`/api/v1/airport-requests/${request.id}/cancel`, {
    method: "POST",
    auth: pilot,
  });
  expect((await cancelled.json()).data.status).toBe("cancelled");
  const late = await call(`/api/v1/airport-requests/${request.id}/answer`, {
    auth: manager,
    body: { decision: "decline", note: "Closed" },
  });
  expect(late.status).toBe(409);
  expect((await late.json()).error.details.reason).toBe("request_closed");
  expect(
    (await call(`/api/v1/airport-requests/${crypto.randomUUID()}`, { auth: pilot })).status,
  ).toBe(404);

  // 7. An airfield without PPR confirms at once
  const quick = await call("/api/v1/airport-requests", {
    auth: pilot,
    body: {
      airport: open,
      registration: "D-EFGH",
      departure: { at: inHours(30), to: "LBSF" },
      pob: 1,
    },
  });
  expect(quick.status).toBe(201);
  expect((await quick.json()).data).toMatchObject({ status: "approved", autoConfirmed: true });
});
