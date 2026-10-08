import { expect, test } from "@playwright/test";

import * as R from "../../lib/api/responses";
import {
  PASSWORD,
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
    const signIn = await app("/api/auth/sign-in/email", {
      body: { email: pilotEmail, password: PASSWORD },
    });
    expect(signIn.status).toBe(200);
    const token = signIn.headers.get("set-auth-token");
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
});
