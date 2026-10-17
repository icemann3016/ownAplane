import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import {
  seedAcceptedBooking,
  seedAirfield,
  seedListedAircraft,
  seedVerifiedPilot,
  signUp,
  unique,
  withDb,
} from "./helpers";

// A pilot sends a request to an airfield from a booking, ticking services from its list; the
// airfield's team sees it on its movements board and approves it with a PPR number; the pilot
// cancels. Airfields without PPR confirm at once (APT-2…7, Zlati 2026-10-13).
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

/** "2026-10-14T12:00" (UTC) `hours` from now, for a datetime-local field. */
const utcIn = (hours: number) =>
  new Date(Date.now() + hours * 3_600_000).toISOString().slice(0, 13) + ":00";

test("a pilot asks an airfield for PPR and services; its team answers from the board", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const id = unique();
  const short = id
    .replace(/[^a-z0-9]/gi, "")
    .slice(-6)
    .toUpperCase();
  const ident = `ZR-${short}`;
  const name = `Hilltop ${id}`;
  const managerEmail = `apt-board-${id}@example.com`;
  const pilotEmail = `apt-pilot-${id}@example.com`;
  const registration = `LZ${short.slice(-3)}`;

  // The airfield's manager (who also rents out an aircraft) and a pilot with a booking from it.
  await signUp(page, `Manager ${id}`, managerEmail);
  await seedAirfield(ident, name, managerEmail, true);
  const pilotContext = await browser.newContext();
  const pilot = await pilotContext.newPage();
  await signUp(pilot, `Pilot ${id}`, pilotEmail);
  await withDb(
    (sql) => sql`insert into user_roles (user_id, role)
      select id, 'pilot' from users where email = ${pilotEmail}`,
  );
  await seedVerifiedPilot(pilotEmail);
  const aircraftId = await seedListedAircraft(managerEmail, registration);
  const bookingId = await seedAcceptedBooking(aircraftId, pilotEmail, 24 * 60);
  await withDb(
    (sql) =>
      sql`update bookings set departure_ident = ${ident}, arrival_ident = 'LBSF' where id = ${bookingId}`,
  );

  // 1. From the booking to a request filled in from it
  await pilot.goto(`/bookings/${bookingId}`);
  await pilot.getByRole("link", { name: `Send a request to ${ident} ${name}` }).click();
  await expect(
    pilot.getByRole("heading", { name: `Arrive or depart at ${ident} ${name}` }),
  ).toBeVisible();
  await expect(pilot.getByLabel("Registration")).toHaveValue(registration);
  await expect(pilot.getByLabel("I'm departing")).toBeChecked();
  // Arriving first, then leaving with the booking.
  await pilot.getByLabel("I'm arriving").check();
  const arrival = utcIn(4);
  const arrivalDay = arrival.slice(0, 10);
  await pilot.getByLabel("Arrival (UTC)").fill(arrival);
  await pilot.getByRole("combobox", { name: "From" }).fill("LBSF");
  await pilot.getByRole("option", { name: /LBSF/ }).click();
  await pilot.getByLabel("MTOM (kg)").fill("1157");
  // The landing charge comes with the arrival, in the 2,000 kg band.
  await expect(pilot.getByLabel(/Landing charges/)).toBeChecked();
  await expect(pilot.getByText("€25.00 per landing")).toBeVisible();
  await pilot.getByLabel(/Fuel: AVGAS 100LL/).check();
  await pilot.getByLabel("Quantity for Fuel: AVGAS 100LL").fill("80");
  await pilot.getByLabel(/Customs and border control/).check();
  await expect(pilot.getByText("Rough total: €253.72")).toBeVisible();
  await expect(pilot.getByText("+ 1 item on request")).toBeVisible();
  await pilot.getByLabel("Other").fill("Taxi to town, please");
  await expectAccessible(pilot);
  await pilot.getByRole("button", { name: "Send request" }).click();

  await expect(pilot.getByText("Request sent. The airfield will answer")).toBeVisible();
  await expect(pilot.getByText("Waiting for the airfield")).toBeVisible();
  await expect(pilot.getByText("€228.72")).toBeVisible();
  await expect(pilot.getByText("Taxi to town, please")).toBeVisible();
  const requestUrl = pilot.url().replace(/\?.*$/, "");
  await expectAccessible(pilot);

  // 2. The team sees it on the board for that day and approves it with a PPR number
  await page.goto(`/airports/manage/${ident}?view=day&day=${arrivalDay}`);
  await expect(page.getByRole("heading", { name: "Movements" })).toBeVisible();
  const row = page.getByRole("link", { name: new RegExp(registration) }).first();
  await expect(row).toContainText("AVGAS 100LL 80 L");
  await expectAccessible(page);
  await page.getByRole("link", { name: "Week" }).click();
  await expect(page.getByRole("link", { name: "Week" })).toHaveAttribute("aria-current", "page");
  await row.click();
  await expect(page).toHaveURL(/\/airport-requests\//);
  await expect(page.getByRole("link", { name: `Pilot ${id}`, exact: true })).toBeVisible();
  await page.getByLabel("PPR number (optional)").fill("PPR-7");
  await page.getByLabel("Conditions (optional)").fill("Arrive after 10:00 UTC");
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(page.getByText("Answer sent. The pilot has been told.")).toBeVisible();

  // 3. The pilot sees the answer, and is told
  await pilot.goto(requestUrl);
  await expect(pilot.getByText("Approved", { exact: true })).toBeVisible();
  await expect(pilot.getByText("PPR-7")).toBeVisible();
  await pilot.goto("/notifications");
  await expect(pilot.getByText(new RegExp(`${ident} approved your request`))).toBeVisible();

  // 4. The pilot cancels; it leaves the board
  await pilot.goto(requestUrl);
  await pilot.getByRole("button", { name: "Cancel request" }).click();
  await expect(pilot.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(pilot.getByRole("button", { name: "Cancel request" })).toHaveCount(0);
  await page.goto(`/airports/manage/${ident}?view=week&day=${arrivalDay}`);
  await expect(page.getByRole("link", { name: new RegExp(registration) })).toHaveCount(0);
  await pilotContext.close();
});

test("an airfield without PPR confirms a request at once", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const id = unique();
  const ident = `ZN-${id
    .replace(/[^a-z0-9]/gi, "")
    .slice(-6)
    .toUpperCase()}`;
  const managerEmail = `apt-open-${id}@example.com`;
  const pilotEmail = `apt-open-pilot-${id}@example.com`;
  await signUp(page, `Manager ${id}`, managerEmail);
  await seedAirfield(ident, `Meadow ${id}`, managerEmail, false);
  const pilotContext = await browser.newContext();
  const pilot = await pilotContext.newPage();
  await signUp(pilot, `Pilot ${id}`, pilotEmail);
  await withDb(
    (sql) => sql`insert into user_roles (user_id, role)
      select id, 'pilot' from users where email = ${pilotEmail}`,
  );

  await pilot.goto(`/airports/${ident}`);
  await pilot.getByRole("link", { name: "Request to arrive or depart" }).click();
  await pilot.getByLabel("Registration").fill("D-EFGH");
  await pilot.getByLabel("Arrival (UTC)").fill(utcIn(30));
  await pilot.getByRole("combobox", { name: "From" }).fill("LBSF");
  await pilot.getByRole("option", { name: /LBSF/ }).click();
  await pilot.getByRole("button", { name: "Send request" }).click();
  await expect(pilot.getByText("Request sent and confirmed")).toBeVisible();
  await expect(pilot.getByText("Confirmed", { exact: true })).toBeVisible();

  // The team hears of it.
  await page.goto("/notifications");
  await expect(page.getByText(new RegExp(`is coming to ${ident}: D-EFGH`))).toBeVisible();
  await pilotContext.close();
});
