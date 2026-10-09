import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import {
  seedAcceptedBooking,
  seedListedAircraft,
  seedVerifiedPilot,
  signUp,
  unique,
  userId,
  withDb,
} from "./helpers";

// Calendar sync with another booking system (SYN-1…5): the owner connects a system, which pushes
// its bookings with an API key; they block the aircraft, clashes are flagged, and the other
// system reads ours from a private iCal link.
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

const hour = 60 * 60 * 1000;

test("another system pushes its bookings and never double-books the aircraft", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const id = unique();
  const letters = id
    .replace(/[^a-z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  const ownerEmail = `sync-owner-${id}@example.com`;
  const pilotEmail = `sync-pilot-${id}@example.com`;
  await signUp(page, `Owner ${id}`, ownerEmail);
  const aircraftId = await seedListedAircraft(ownerEmail, `LZ-C${letters}`);
  const pilotContext = await browser.newContext();
  await signUp(await pilotContext.newPage(), `Pilot ${id}`, pilotEmail);
  await pilotContext.close();
  await seedVerifiedPilot(pilotEmail);

  // 1. The owner connects the club's system and gets an API key, shown once
  await page.goto(`/owner/aircraft/${aircraftId}/sync`);
  await expect(page.getByRole("heading", { name: "Calendar sync", level: 1 })).toBeVisible();
  await page.getByLabel("Name").fill("Club system");
  await page.getByRole("radio", { name: /It sends them to us/ }).check();
  await page.getByRole("button", { name: "Connect" }).click();
  const keyField = page.getByLabel("API key (shown only once)");
  await expect(keyField).toBeVisible();
  const key = await keyField.inputValue();
  expect(key).toMatch(/^oap_/);

  const club = (path: string, init: { method?: string; body?: unknown; key?: string } = {}) =>
    fetch(new URL(path, baseURL), {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${init.key ?? key}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  const who = await (await club("/api/v1/sync")).json();
  expect(who.data.aircraft.id).toBe(aircraftId);

  // 2. A club booking blocks the aircraft for pilots
  const now = new Date();
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 20);
  const span = (from: number, to: number) => ({
    start: new Date(day + from * hour).toISOString(),
    end: new Date(day + to * hour).toISOString(),
  });
  const first = await club("/api/v1/sync/busy/club-1", { method: "PUT", body: span(8, 11) });
  expect((await first.json()).data).toEqual({ externalId: "club-1", status: "active" });
  const search = await fetch(
    new URL(
      `/api/v1/aircraft?airport=LBSF&radius=25&from=${encodeURIComponent(span(9, 10).start)}&to=${encodeURIComponent(span(9, 10).end)}`,
      baseURL,
    ),
  );
  expect((await search.json()).data.map((a: { id: string }) => a.id)).not.toContain(aircraftId);

  // 3. A club booking over an ownAplane booking is recorded as a conflict (409)
  const bookingId = await seedAcceptedBooking(aircraftId, pilotEmail, 48 * 60);
  const [booked] = await withDb(
    (sql) => sql<{ from: Date; to: Date }[]>`
      select lower(period) as "from", upper(period) as "to" from bookings where id = ${bookingId}`,
  );
  const clash = await club("/api/v1/sync/busy/club-2", {
    method: "PUT",
    body: { start: booked!.from.toISOString(), end: booked!.to.toISOString() },
  });
  expect(clash.status).toBe(409);
  expect((await clash.json()).error).toMatchObject({
    code: "conflict",
    details: { recorded: true, status: "conflict" },
  });
  await page.reload();
  await expect(page.getByText("Double bookings with Club system")).toBeVisible();
  await expectAccessible(page);

  // 4. The club sees our busy times (its own excluded), by API and by iCal link
  const busy = await club(
    `/api/v1/sync/busy?from=${encodeURIComponent(new Date(Date.now()).toISOString())}&to=${encodeURIComponent(new Date(day + 24 * hour).toISOString())}`,
  );
  const busyTimes = (await busy.json()).data as { from: string; kind: string }[];
  expect(busyTimes.map((b) => b.kind)).toContain("booking");
  expect(busyTimes.some((b) => b.from === span(8, 11).start)).toBe(false);
  const link = await page.getByLabel("Our iCal link for this system").inputValue();
  const ics = await (await fetch(new URL(new URL(link).pathname, baseURL))).text();
  expect(ics).toContain("BEGIN:VCALENDAR");
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  expect(ics).toContain(`DTSTART:${stamp(booked!.from)}`);
  expect(ics).not.toContain(`DTSTART:${stamp(new Date(span(8, 11).start))}`);

  // 5. The owner sees the club's booking in the calendar
  const month = new Date(day).toISOString().slice(0, 7);
  await page.goto(`/owner/aircraft/${aircraftId}/calendar?month=${month}`);
  await expect(page.getByText("From Club system").first()).toBeVisible();

  // 6. While the club holds a time, the owner can't accept a request for it
  const requestId = await withDb(async (sql) => {
    const pilot = await userId(sql, pilotEmail);
    const range = `[${span(14, 16).start},${span(14, 16).end})`;
    return sql.begin(async (tx) => {
      await tx`select set_config('app.user_id', ${pilot}, true)`;
      const [{ id: requested }] = await tx<{ id: string }[]>`
        select public.request_booking(${aircraftId}::uuid, ${range}::tstzrange,
          'LBSF', 'LBSF', '{}'::text[], 'local', 0, 1.5, null, 270) as id`;
      return requested;
    });
  });
  const late = await club("/api/v1/sync/busy/club-3", { method: "PUT", body: span(15, 17) });
  expect(late.status).toBe(409);
  await page.goto(`/bookings/${requestId}`);
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText(/This time is booked in a connected system/)).toBeVisible();

  // 7. Cancelled in the club: the time is free; a replaced key stops working
  expect((await club("/api/v1/sync/busy/club-1", { method: "DELETE" })).status).toBe(200);
  expect((await club("/api/v1/sync/busy/club-1", { method: "DELETE" })).status).toBe(404);
  await page.goto(`/owner/aircraft/${aircraftId}/sync`);
  await page.getByRole("button", { name: "Replace API key" }).click();
  await expect(page.getByLabel("API key (shown only once)")).toBeVisible();
  expect((await club("/api/v1/sync")).status).toBe(401);
});
