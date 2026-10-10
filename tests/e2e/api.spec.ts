import { expect, test } from "@playwright/test";

import * as R from "../../lib/api/responses";
import {
  apiSignIn,
  seedAcceptedBooking,
  seedListedAircraft,
  seedVerifiedPilot,
  signUp,
  unique,
  withDb,
} from "./helpers";

// The REST API for apps and partners (API-1, 2, 4, 5): token sign-in, conventions, and that the
// responses match the published shapes (lib/api/responses.ts).

test("the API describes itself and refuses requests without a token", async ({ request }) => {
  const doc = await request.get("/api/v1/openapi.json");
  expect(doc.status()).toBe(200);
  expect((await doc.json()).paths["/api/v1/me"]).toBeTruthy();

  const me = await request.get("/api/v1/me");
  expect(me.status()).toBe(401);
  expect(me.headers()["www-authenticate"]).toContain("Bearer");
  expect(R.errorBody.parse(await me.json()).error.code).toBe("unauthorized");

  const bad = await request.get("/api/v1/airports?q=x");
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error.fields.q).toHaveLength(1);
});

test.describe("with accounts", () => {
  test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

  test("an app signs in with a token and reads its data", async ({
    page,
    browser,
    request,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const id = unique();
    const letters = id
      .replace(/[^a-z]/g, "")
      .slice(0, 3)
      .toUpperCase()
      .padEnd(3, "X");
    const ownerEmail = `api-owner-${id}@example.com`;
    const pilotEmail = `api-pilot-${id}@example.com`;
    // Like a mobile app: plain requests without a cookie jar, with the app's origin.
    const app = (path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
      fetch(new URL(path, baseURL), {
        method: init.method ?? (init.body ? "POST" : "GET"),
        headers: {
          origin: "ownaplane://app", // our apps' origin (trusted for sign-in, lib/auth/auth.ts)
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.token ? { authorization: init.token } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
    await signUp(page, `Pilot ${id}`, pilotEmail);
    const ownerContext = await browser.newContext();
    await signUp(await ownerContext.newPage(), `Owner ${id}`, ownerEmail);
    await ownerContext.close();
    const aircraftId = await seedListedAircraft(ownerEmail, `LZ-A${letters}`);
    await seedVerifiedPilot(pilotEmail);
    const bookingId = await seedAcceptedBooking(aircraftId, pilotEmail, 24 * 60);

    // 1. Sign in: the token comes in the set-auth-token header
    const token = await apiSignIn(baseURL, pilotEmail);
    expect(token).toBeTruthy();
    const bearer = `Bearer ${token}`;
    const get = (path: string, auth = bearer) => app(path, { token: auth });

    // 2. The account
    const me = await get("/api/v1/me");
    expect(me.status).toBe(200);
    const meData = R.me.parse((await me.json()).data);
    expect(meData.email).toBe(pilotEmail);
    expect(meData.displayName).toBe(`Pilot ${id}`);

    // 3. Only Bearer tokens count: not browser cookies, not unsigned or made-up tokens
    expect((await page.request.get("/api/v1/me")).status()).toBe(401);
    const unsigned = token!.split(".")[0]!;
    for (const value of [`Bearer ${unsigned}`, "Bearer nonsense.token", `Basic ${token}`]) {
      expect((await get("/api/v1/me", value)).status).toBe(401);
    }

    // 4. Bookings: the list and the detail match the published shapes
    const list = await get("/api/v1/bookings");
    const bookings = (await list.json()).data.map((b: unknown) => R.bookingSummary.parse(b));
    const mine = bookings.find((b: R.BookingSummary) => b.id === bookingId);
    expect(mine).toMatchObject({ status: "accepted", role: "pilot" });
    const detail = await get(`/api/v1/bookings/${bookingId}`);
    const booking = R.bookingDetail.parse((await detail.json()).data);
    expect(booking.route[0]?.ident).toBe("LBSF");
    expect(booking.history.map((h) => h.type)).toContain("accepted");
    // Someone else's booking doesn't exist for this user.
    const other = await withDb(
      (sql) => sql<{ id: string }[]>`select id from bookings where id <> ${bookingId} limit 1`,
    );
    if (other[0]) {
      expect((await get(`/api/v1/bookings/${other[0].id}`)).status).toBe(404);
    }

    // 5. Aircraft and airports (public)
    const plane = await request.get(`/api/v1/aircraft/${aircraftId}`);
    const aircraft = R.aircraftDetail.parse((await plane.json()).data);
    expect(aircraft.homeAirport?.ident).toBe("LBSF");
    const search = await request.get("/api/v1/aircraft?airport=LBSF&radius=25");
    const found = (await search.json()).data.map((a: unknown) => R.aircraftSummary.parse(a));
    expect(found.map((a: R.AircraftSummary) => a.id)).toContain(aircraftId);
    // During the accepted booking the aircraft isn't free.
    const busy = await request.get(
      `/api/v1/aircraft?airport=LBSF&from=${encodeURIComponent(booking.from!)}&to=${encodeURIComponent(booking.to!)}`,
    );
    expect((await busy.json()).data.map((a: { id: string }) => a.id)).not.toContain(aircraftId);
    expect((await request.get("/api/v1/aircraft?eligible=true")).status()).toBe(401);
    const airports = await request.get("/api/v1/airports?q=LBSF");
    expect(R.airport.parse((await airports.json()).data[0]).ident).toBe("LBSF");

    // 6. Signing out revokes the token
    expect((await app("/api/auth/sign-out", { body: {}, token: bearer })).status).toBe(200);
    expect((await get("/api/v1/me")).status).toBe(401);
  });

  test("a pilot books and the owner answers through the API", async ({ browser, baseURL }) => {
    test.setTimeout(90_000);
    const id = unique();
    const letters = id
      .replace(/[^a-z]/g, "")
      .slice(0, 3)
      .toUpperCase()
      .padEnd(3, "X");
    const ownerEmail = `api-b-owner-${id}@example.com`;
    const pilotEmail = `api-b-pilot-${id}@example.com`;
    for (const [name, email] of [
      [`Owner ${id}`, ownerEmail],
      [`Pilot ${id}`, pilotEmail],
    ] as const) {
      const context = await browser.newContext();
      await signUp(await context.newPage(), name, email);
      await context.close();
    }
    const aircraftId = await seedListedAircraft(ownerEmail, `LZ-B${letters}`);
    await seedVerifiedPilot(pilotEmail);
    const app = (path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
      fetch(new URL(path, baseURL), {
        method: init.method ?? (init.body ? "POST" : "GET"),
        headers: {
          origin: "ownaplane://app",
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.token ? { authorization: init.token } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
    const pilot = `Bearer ${await apiSignIn(baseURL, pilotEmail)}`;
    const owner = `Bearer ${await apiSignIn(baseURL, ownerEmail)}`;

    // A daytime slot ten days ahead.
    const day = new Date();
    day.setUTCDate(day.getUTCDate() + 10);
    const at = (h: number) =>
      new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h),
      ).toISOString();
    const window = `from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(23))}`;

    // 1. Free, and the pilot may rent it (reasons in the user's language)
    const free = await app(`/api/v1/aircraft/${aircraftId}/availability?${window}`);
    expect((await free.json()).data).toEqual([]);
    const daytime = `from=${encodeURIComponent(at(9))}&to=${encodeURIComponent(at(12))}`;
    const can = await app(`/api/v1/aircraft/${aircraftId}/eligibility?${daytime}`, {
      token: pilot,
    });
    expect(R.eligibility.parse((await can.json()).data).eligible).toBe(true);

    // 2. The pilot requests it
    const request = {
      aircraftId,
      from: at(9),
      to: at(12),
      departure: "LBSF",
      arrival: "LBSF",
      purpose: "local",
      passengers: 0,
      plannedHours: 1.5,
    };
    expect(
      (await app("/api/v1/bookings", { body: { ...request, passengers: 25 }, token: pilot }))
        .status,
    ).toBe(400);
    const created = await app("/api/v1/bookings", { body: request, token: pilot });
    expect(created.status).toBe(201);
    const booking = R.bookingDetail.parse((await created.json()).data);
    expect(booking).toMatchObject({ status: "requested", role: "pilot" });
    const busy = (await (await app(`/api/v1/aircraft/${aircraftId}/availability?${window}`)).json())
      .data;
    expect(busy.map((b: unknown) => R.busyPeriod.parse(b))).toMatchObject([
      { kind: "booking", pending: true, from: at(9) },
    ]);
    // The same time again isn't free.
    const twice = await app("/api/v1/bookings", { body: request, token: pilot });
    expect(twice.status).toBe(409);
    expect((await twice.json()).error.details.reason).toBe("not_free");

    // 3. Only the owner answers
    expect(
      (await app(`/api/v1/bookings/${booking.id}/accept`, { method: "POST", token: pilot })).status,
    ).toBe(404);
    const accepted = await app(`/api/v1/bookings/${booking.id}/accept`, {
      method: "POST",
      token: owner,
    });
    expect(R.bookingDetail.parse((await accepted.json()).data).status).toBe("accepted");

    // 3b. They talk about it; the pilot is told about the acceptance in their language
    const opened = await app("/api/v1/conversations", {
      body: { aircraftId, bookingId: booking.id, body: "See you at the hangar at 08:45." },
      token: owner,
    });
    expect(opened.status).toBe(201);
    const conversation = (await opened.json()).data;
    const inbox = (await (await app("/api/v1/conversations", { token: pilot })).json()).data;
    expect(inbox).toContainEqual(
      expect.objectContaining({ id: conversation.id, role: "pilot", unread: true }),
    );
    const reply = await app(`/api/v1/conversations/${conversation.id}/messages`, {
      body: { body: "Thanks!" },
      token: pilot,
    });
    expect((await reply.json()).data.messages.map((m: { mine: boolean }) => m.mine)).toEqual([
      false,
      true,
    ]);
    const notes = await (await app("/api/v1/notifications", { token: pilot })).json();
    expect(notes.unread).toBeGreaterThan(0);
    expect(notes.data).toContainEqual(
      expect.objectContaining({ type: "accepted", bookingId: booking.id, read: false }),
    );
    expect((await app("/api/v1/notifications/read", { method: "POST", token: pilot })).status).toBe(
      200,
    );

    // 3c. Favourites and a saved search
    expect(
      (await app(`/api/v1/favourites/${aircraftId}`, { method: "PUT", token: pilot })).status,
    ).toBe(200);
    const favourites = (await (await app("/api/v1/favourites", { token: pilot })).json()).data;
    expect(favourites.map((f: { aircraft: { id: string } }) => f.aircraft.id)).toEqual([
      aircraftId,
    ]);
    const saved = await app("/api/v1/saved-searches", {
      body: { name: "Sofia", query: "airport=LBSF&radius=25" },
      token: pilot,
    });
    const search = (await saved.json()).data;
    expect(search).toMatchObject({ name: "Sofia", alerts: true, filters: { airport: "LBSF" } });
    const off = await app(`/api/v1/saved-searches/${search.id}`, {
      method: "PATCH",
      body: { alerts: false },
      token: pilot,
    });
    expect((await off.json()).data.alerts).toBe(false);
    expect(
      (await app(`/api/v1/saved-searches/${search.id}`, { method: "DELETE", token: owner })).status,
    ).toBe(404);

    // 4. The pilot cancels in time (free under the owner's policy)
    const cancelled = await app(`/api/v1/bookings/${booking.id}/cancel`, {
      body: { reason: "Weather" },
      token: pilot,
    });
    const body = await cancelled.json();
    expect(body.data.status).toBe("cancelled");
    expect(body.details).toEqual({ late: false });
  });

  test("a pilot keeps the flight log and the owner confirms it through the API", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const id = unique();
    const letters = id
      .replace(/[^a-z]/g, "")
      .slice(0, 3)
      .toUpperCase()
      .padEnd(3, "X");
    const ownerEmail = `api-l-owner-${id}@example.com`;
    const pilotEmail = `api-l-pilot-${id}@example.com`;
    for (const [name, email] of [
      [`Owner ${id}`, ownerEmail],
      [`Pilot ${id}`, pilotEmail],
    ] as const) {
      const context = await browser.newContext();
      await signUp(await context.newPage(), name, email);
      await context.close();
    }
    const aircraftId = await seedListedAircraft(ownerEmail, `LZ-G${letters}`);
    await seedVerifiedPilot(pilotEmail);
    const bookingId = await seedAcceptedBooking(aircraftId, pilotEmail, 30);
    const [{ from }] = await withDb(
      (sql) =>
        sql<{ from: Date }[]>`select lower(period) as "from" from bookings where id = ${bookingId}`,
    );
    const pilot = `Bearer ${await apiSignIn(baseURL, pilotEmail)}`;
    const owner = `Bearer ${await apiSignIn(baseURL, ownerEmail)}`;
    const call = (path: string, token: string, method = "GET", body?: unknown) =>
      fetch(new URL(`/api/v1/bookings/${bookingId}/log${path}`, baseURL), {
        method,
        headers: {
          authorization: token,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    const log = async (res: Response, status = 200) => {
      expect(res.status).toBe(status);
      return R.flightLog.parse((await res.json()).data);
    };
    const at = (minutes: number) => new Date(from.getTime() + minutes * 60_000).toISOString();

    // 1. Check-out and the readings found
    expect((await call("", pilot)).status).toBe(404);
    expect((await log(await call("", pilot, "POST"), 201)).status).toBe("draft");
    await log(await call("/checkout", pilot, "PUT", { hobbsStart: 1000, fuelStartL: 120 }));

    // 2. A leg with times out of order is refused, with the field to fix
    const leg = {
      from: "LBSF",
      to: "LBSF",
      engineStart: at(5),
      blockOff: at(10),
      takeoffAt: at(15),
      landingAt: at(65),
      blockOn: at(70),
      engineStop: at(75),
      hobbsStart: 1000,
      hobbsEnd: 1001.2,
      fuelBeforeL: 120,
      fuelAfterL: 84,
    };
    const wrong = await call("/legs", pilot, "POST", { ...leg, blockOff: at(2) });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toMatchObject({
      details: { reason: "leg_order" },
      fields: { blockOff: ["not_before:engineStart"] },
    });
    const withLeg = await log(await call("/legs", pilot, "POST", leg), 201);
    expect(withLeg.legs).toHaveLength(1);
    expect(withLeg.amount).toMatchObject({ flownMinutes: 72, confirmed: false });

    // 3. Fuel of the wrong type shows up in the checks; a remark for the owner
    const fuelled = await log(
      await call("/uplifts", pilot, "POST", {
        kind: "fuel",
        airport: "LBSF",
        quantityL: 30,
        fuelType: "jet_a1",
        paidBy: "pilot",
      }),
      201,
    );
    expect(fuelled.checks).toContainEqual(
      expect.objectContaining({ type: "wrongFuel", severity: "danger" }),
    );
    await log(await call("/uplifts/" + fuelled.uplifts[0]!.id, pilot, "DELETE"));
    await log(
      await call("/remarks", pilot, "POST", { kind: "aircraft", body: "COM2 scratchy" }),
      201,
    );

    // 4. Check-in; only the owner confirms
    expect((await log(await call("/submit", pilot, "POST"))).status).toBe("submitted");
    expect((await call("/confirm", pilot, "POST")).status).toBe(404);
    const confirmed = await log(await call("/confirm", owner, "POST"));
    expect(confirmed).toMatchObject({ status: "confirmed", editable: false });
    expect(confirmed.amount).toMatchObject({ flownMinutes: 72, confirmed: true });

    // 5. Both review, double-blind; the owner replies to the published review
    const reviews = (token: string, method = "GET", body?: unknown) =>
      fetch(new URL(`/api/v1/bookings/${bookingId}/reviews`, baseURL), {
        method,
        headers: {
          authorization: token,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    const bad = await reviews(pilot, "POST", { scores: { airmanship: 5 } });
    expect(bad.status).toBe(400);
    const mine = (
      await (
        await reviews(pilot, "POST", {
          scores: { aircraft_condition: 5, communication: 4, value: 5 },
          comment: "Lovely aircraft.",
        })
      ).json()
    ).data;
    expect(mine.mine).toMatchObject({ direction: "pilot_to_owner", publishedAt: null });
    expect(mine.theirs).toBeNull();
    await reviews(owner, "POST", {
      scores: { airmanship: 5, punctuality: 5, communication: 5, condition_returned: 5 },
    });
    const both = (await (await reviews(pilot)).json()).data;
    expect(both.mine.publishedAt).not.toBeNull();
    expect(both.theirs).toMatchObject({ direction: "owner_to_pilot" });
    const replied = await fetch(new URL(`/api/v1/reviews/${both.mine.id}/reply`, baseURL), {
      method: "POST",
      headers: { authorization: owner, "content-type": "application/json" },
      body: JSON.stringify({ text: "Thanks, come again!" }),
    });
    expect((await replied.json()).data).toMatchObject({ reply: "Thanks, come again!" });
    const published = await fetch(new URL(`/api/v1/aircraft/${aircraftId}/reviews`, baseURL));
    expect((await published.json()).data.map((r: { id: string }) => r.id)).toContain(both.mine.id);
  });
});
