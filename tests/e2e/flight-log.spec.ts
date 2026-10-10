import { expect, test } from "@playwright/test";

import {
  seedAcceptedBooking,
  seedListedAircraft,
  seedVerifiedPilot,
  signUp,
  unique,
} from "./helpers";

// The pilot checks out, logs a leg and checks in → the owner confirms the flown time and the
// amount due (BKG-7, BKG-12).
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

test("a pilot fills in the flight log and the owner confirms it", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const id = unique();
  const letters = id
    .replace(/[^a-z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  const ownerEmail = `owner-l-${id}@example.com`;
  const pilotEmail = `pilot-l-${id}@example.com`;
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await signUp(owner, `Owner ${id}`, ownerEmail);
  const aircraftId = await seedListedAircraft(ownerEmail, `LZ-L${letters}`);
  await signUp(page, `Pilot ${id}`, pilotEmail);
  await seedVerifiedPilot(pilotEmail);
  const bookingId = await seedAcceptedBooking(aircraftId, pilotEmail);

  // 1. Check-out opens the log
  await page.goto(`/bookings/${bookingId}`);
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page).toHaveURL(new RegExp(`/bookings/${bookingId}/log$`));
  await expect(page.getByRole("heading", { name: "Flight log", level: 1 })).toBeVisible();
  await page.getByLabel("Hobbs", { exact: true }).fill("1000");
  await page.getByLabel("Fuel on board (L)").fill("100");
  await page.getByRole("button", { name: "Save check-out" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // 2. One leg, times in local time; the amount follows the Hobbs meter
  await page.getByRole("button", { name: "Add leg" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "To" }).fill("LBSF");
  await dialog.getByRole("listbox").getByRole("option").first().click();
  for (const [label, time] of [
    ["Engine start", "10:00"],
    ["Block off", "09:55"],
    ["Block on", "11:15"],
    ["Engine stop", "11:20"],
  ]) {
    await dialog.getByLabel(label, { exact: true }).fill(time);
  }
  await dialog.getByLabel("Hobbs start").fill("1000");
  await dialog.getByLabel("Hobbs end").fill("1001.2");
  // Fuel in US gallons (stored in litres): 31.7 US gal = 120 L, more than at check-out.
  await dialog.getByLabel("Fuel unit").selectOption("usgal");
  await dialog.getByLabel("Fuel before (US gal)").fill("31.7");
  await dialog.getByLabel("Fuel after (US gal)").fill("35");
  await dialog.getByRole("button", { name: "Save leg" }).click();
  // Block off before engine start; fuel can't go up during a leg.
  await expect(dialog.getByText("Can't be before Engine start.")).toBeVisible();
  await expect(dialog.getByText(/Fuel after must be lower than fuel before/)).toBeVisible();
  await dialog.getByLabel("Block off", { exact: true }).fill("10:05");
  await dialog.getByLabel("Fuel after (US gal)").fill("20");
  await dialog.getByRole("button", { name: "Save leg" }).click();
  await expect(dialog).toBeHidden();
  // Fuel went up between check-out and the leg without a recorded refuelling.
  await expect(page.getByText("Fuel went up by 20 L before leg 1 at LBSF")).toBeVisible();
  await expect(page.getByText("1. LBSF → LBSF")).toBeVisible();
  await expect(page.getByText("1 h 12 min")).toBeVisible();
  await expect(page.getByText("€216", { exact: true })).toBeVisible();

  // 3. Fuel the pilot paid for is taken off the wet rate (BKG-13)
  await page.getByRole("button", { name: "Add fuel or oil" }).click();
  const fuel = page.getByRole("dialog");
  await fuel.getByRole("combobox", { name: "Airfield" }).fill("LBSF");
  await fuel.getByRole("listbox").getByRole("option").first().click();
  await fuel.getByLabel("Quantity (L)").fill("40");
  // Picking a fuel that doesn't suit the aircraft warns at once.
  await fuel.getByLabel("Fuel type").selectOption("jet_a1");
  await expect(fuel.getByText("This aircraft uses AVGAS 100LL, not Jet A-1.")).toBeVisible();
  await fuel.getByLabel("Fuel type").selectOption("avgas_100ll");
  await expect(fuel.getByText(/This aircraft uses/)).toHaveCount(0);
  await fuel.getByLabel("Price paid (EUR, optional)").fill("100");
  await fuel.getByRole("button", { name: "Save" }).click();
  await expect(fuel).toBeHidden();
  await expect(page.getByText("Fuel 40 L · LBSF")).toBeVisible();
  await expect(page.getByText("Check the fuel and oil readings")).toHaveCount(0);
  await expect(page.getByText("-€100", { exact: true })).toBeVisible();
  await expect(page.getByText("€116", { exact: true })).toBeVisible();

  // 4. A remark about the aircraft (BKG-15)
  await page.getByLabel("Remark", { exact: true }).fill("Left mag drop 150 rpm");
  await page.getByRole("button", { name: "Add remark" }).click();
  await expect(page.getByText("Remark added.")).toBeVisible();
  await expect(page.getByText("Left mag drop 150 rpm", { exact: true })).toBeVisible();

  // 5. Check-in: the pilot can't change it any more
  await page.getByRole("button", { name: "Check in and send to the owner" }).click();
  await expect(page.getByText("Sent. Waiting for the owner to confirm.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add leg" })).toHaveCount(0);

  // 6. The owner confirms; the booking is completed
  await owner.goto(`/bookings/${bookingId}`);
  await owner.getByRole("link", { name: "Flight log" }).click();
  await expect(owner.getByText("€116", { exact: true })).toBeVisible();
  await owner.getByRole("button", { name: "Confirm log and amount" }).click();
  await expect(owner.getByText(/· Confirmed$/)).toBeVisible();
  await owner.goto(`/bookings/${bookingId}`);
  await expect(owner.getByText("Completed", { exact: true }).first()).toBeVisible();
  await expect(owner.getByText("Flight log confirmed")).toBeVisible();

  // 7. The owner marks the remark as a known item in the aircraft's history
  await owner.goto(`/owner/aircraft/${aircraftId}/remarks`);
  await expect(owner.getByText("Left mag drop 150 rpm", { exact: true })).toBeVisible();
  await owner.getByRole("button", { name: "Mark as known item" }).click();
  await expect(owner.getByText("Known items on this aircraft")).toBeVisible();
  await expect(owner.getByRole("button", { name: "Mark as fixed" })).toBeVisible();

  // 8. Usage history from confirmed logs, with a CSV of the legs (BKG-16)
  await owner.goto(`/owner/aircraft/${aircraftId}/usage`);
  const total = owner.getByRole("table", { name: "Total" });
  await expect(total.getByRole("row", { name: /All flights/ })).toContainText("1 h 12 min");
  // Fetched with the owner's session (browser downloads differ between desktop and mobile).
  const usageLink = owner.getByRole("link", { name: "Export legs (CSV)" });
  await expect(usageLink).toHaveAttribute("href", `/api/aircraft/${aircraftId}/usage`);
  const usageResponse = await owner.request.get(`/api/aircraft/${aircraftId}/usage`);
  expect(usageResponse.headers()["content-type"]).toContain("text/csv");
  const usageText = await usageResponse.text();
  expect(usageText).toContain("Block off (UTC)");
  expect(usageText).toContain(`Pilot ${id}`);
  // The owner records the meters after a flight outside ownAplane.
  await owner.getByLabel("Hobbs", { exact: true }).fill("1001.5");
  await owner.getByRole("button", { name: "Save reading" }).click();
  await expect(owner.getByText("Reading saved.")).toBeVisible();
  await expect(owner.getByText("Hobbs 1001.5")).toBeVisible();
  await ownerContext.close();

  // 9. The pilot exports their own legs for the logbook
  await page.goto("/bookings");
  await expect(page.getByRole("link", { name: "Export my flights (CSV)" })).toHaveAttribute(
    "href",
    "/api/pilot/legs",
  );
  const legsText = await (await page.request.get("/api/pilot/legs")).text();
  expect(legsText).toMatch(/LBSF,\d\d:\d\d,LBSF,\d\d:\d\d,C172,LZ-L/);
  // …but not the owner's usage of the aircraft.
  expect((await page.request.get(`/api/aircraft/${aircraftId}/usage`)).status()).toBe(404);
});
