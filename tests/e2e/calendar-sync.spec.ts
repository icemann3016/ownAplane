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

  // The owner chooses what is exchanged: route and pilot's name out, titles and registrations in
  await page.getByText("Data exchanged with this system").click();
  const send = page.getByRole("group", { name: "Send to this system" });
  await send.getByRole("checkbox", { name: /^Route/ }).check();
  await send.getByRole("checkbox", { name: /^Pilot's name/ }).check();
  const take = page.getByRole("group", { name: "Take from this system" });
  await take.getByRole("checkbox", { name: /^Title/ }).check();
  await take.getByRole("checkbox", { name: /^Aircraft registration/ }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  await expect(
    page.getByText("Sent: times, Route, Pilot's name. Taken: times, Title, Aircraft registration."),
  ).toBeVisible();

  // 2. A club booking blocks the aircraft for pilots
  const now = new Date();
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 20);
  const span = (from: number, to: number) => ({
    start: new Date(day + from * hour).toISOString(),
    end: new Date(day + to * hour).toISOString(),
  });
  const first = await club("/api/v1/sync/busy/club-1", {
    method: "PUT",
    body: { ...span(8, 11), title: "Club lesson", registration: `lz-c${letters}` },
  });
  expect((await first.json()).data).toEqual({ externalId: "club-1", status: "active" });
  const elsewhere = await club("/api/v1/sync/busy/club-9", {
    method: "PUT",
    body: { ...span(18, 19), registration: "D-EXYZ" },
  });
  expect(elsewhere.status).toBe(400);
  expect((await elsewhere.json()).error.fields).toHaveProperty("registration");
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
  await page.getByText("Data exchanged with this system").click();
  await expect(page.getByRole("checkbox", { name: /^Route/ })).toBeChecked();
  await expectAccessible(page);

  // 3b. The club registers a webhook for changes (SYN-6); the owner sees it and sends a test
  const hook = await club("/api/v1/sync/webhook", {
    method: "PUT",
    body: { url: "https://hooks.club-system.invalid/ownaplane" },
  });
  const saved = (await hook.json()).data;
  expect(saved).toMatchObject({ url: "https://hooks.club-system.invalid/ownaplane" });
  expect(saved.secret).toMatch(/^[0-9a-f]{64}$/);
  const again = await club("/api/v1/sync/webhook", {
    method: "PUT",
    body: { url: "https://hooks.club-system.invalid/ownaplane" },
  });
  expect((await again.json()).data.secret).toBeNull();
  expect(
    (await club("/api/v1/sync/webhook", { method: "PUT", body: { url: "http://x.test" } })).status,
  ).toBe(400);
  await page.reload();
  await page.getByText("Tell this system about changes (webhook)").click();
  await expect(page.getByLabel("Webhook address (https)")).toHaveValue(
    "https://hooks.club-system.invalid/ownaplane",
  );
  await expect(page.getByLabel("Signing secret")).toHaveValue(saved.secret);
  await page.getByRole("button", { name: "Send a test" }).click();
  await expect(page.getByText("The address couldn't be reached.").first()).toBeVisible();

  // 4. The club sees our busy times (its own excluded), by API and by iCal link
  const busy = await club(
    `/api/v1/sync/busy?from=${encodeURIComponent(new Date(Date.now()).toISOString())}&to=${encodeURIComponent(new Date(day + 24 * hour).toISOString())}`,
  );
  const busyTimes = (await busy.json()).data as Record<string, unknown>[];
  const ours = busyTimes.find((b) => b.kind === "booking");
  expect(ours).toMatchObject({
    route: { departure: "LBSF", arrival: "LBSF" },
    pilot: { name: `Pilot ${id}` },
  });
  expect(ours).not.toHaveProperty("status"); // not chosen
  expect(busyTimes.some((b) => b.from === span(8, 11).start)).toBe(false);
  const link = await page.getByLabel("Our iCal link for this system").inputValue();
  const ics = await (await fetch(new URL(new URL(link).pathname, baseURL))).text();
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics.replace(/\r\n[ \t]/g, "")).toContain(`Pilot: Pilot ${id}`);
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
  await expect(page.getByText("Club lesson", { exact: true })).toBeVisible();

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

test("an owner adds their RAF Aviation key and connects an aircraft (SYN-7)", async ({ page }) => {
  test.setTimeout(90_000);
  const id = unique();
  const ownerEmail = `raf-owner-${id}@example.com`;
  await signUp(page, `Owner ${id}`, ownerEmail);
  const letters = id
    .replace(/[^a-z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  const registration = `LZ-R${letters}`;
  const aircraftId = await seedListedAircraft(ownerEmail, registration);

  // No key yet: the partner option points to Connected services
  await page.goto(`/owner/aircraft/${aircraftId}/sync`);
  await expect(page.getByRole("radio", { name: /Partner system/ })).toBeDisabled();
  await page.getByRole("link", { name: "Account → Connected services" }).click();
  await expect(page.getByRole("heading", { name: "Connected services", level: 1 })).toBeVisible();

  // The key field: a plain masked text field the browser doesn't save or fill in
  const field = page.getByLabel("API key", { exact: true });
  await expect(field).toHaveAttribute("type", "text");
  await expect(field).toHaveAttribute("autocomplete", "off");
  await expect(field).toHaveAttribute("data-lpignore", "true");

  // A wrong key is checked with RAF Aviation and refused (not kept)
  await field.fill("not-the-right-key");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(
    page.getByText("RAF Aviation refused this key. Check it and try again."),
  ).toBeVisible();
  await expect(page.getByText("Not connected.")).toBeVisible();

  // The right one is kept, never shown again
  await page.getByLabel("API key", { exact: true }).fill("raf-e2e-key");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(
    page.getByText("Key saved. Your RAF Aviation connections are read with it."),
  ).toBeVisible();
  await expect(page.getByText(/Connected: API key ending in …-key/)).toBeVisible();
  await expect(page.getByLabel("New API key")).toHaveValue("");
  expect(await page.content()).not.toContain("raf-e2e-key");
  await expectAccessible(page);

  // Calendar sync reads RAF Aviation for this aircraft's registration
  await page.goto(`/owner/aircraft/${aircraftId}/sync`);
  await page.getByLabel("Name").fill("RAF Aviation");
  await page.getByRole("radio", { name: /Partner system/ }).check();
  await expect(page.getByLabel("Partner", { exact: true })).toHaveValue("rafaviation");
  await expect(page.getByRole("textbox", { name: /API key/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Connected and read: 2 busy times.")).toBeVisible();
  await expect(
    page.getByText(
      `Reads RAF Aviation's bookings for ${registration} with the API key on your account`,
    ),
  ).toBeVisible();
  expect(await page.content()).not.toContain("raf-e2e-key");
  await expectAccessible(page);
  const busy = await withDb(
    (sql) => sql<{ count: number }[]>`
      select count(*)::int as count from calendar_entries
      where aircraft_id = ${aircraftId} and active and connection_id is not null`,
  );
  expect(busy[0]!.count).toBe(2);
});
