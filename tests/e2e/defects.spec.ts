import { expect, test } from "@playwright/test";

import {
  seedAcceptedBooking,
  seedListedAircraft,
  seedVerifiedPilot,
  signUp,
  unique,
} from "./helpers";

// A renter reports a defect → the owner sees it and grounds the aircraft → the renter can't
// check out → the owner marks it fixed (BKG-8).
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

test("a reported defect grounds the aircraft", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const id = unique();
  const letters = id
    .replace(/[^a-z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  const ownerEmail = `owner-d-${id}@example.com`;
  const pilotEmail = `pilot-d-${id}@example.com`;
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await signUp(owner, `Owner ${id}`, ownerEmail);
  const aircraftId = await seedListedAircraft(ownerEmail, `LZ-D${letters}`);
  await signUp(page, `Pilot ${id}`, pilotEmail);
  await seedVerifiedPilot(pilotEmail);
  const bookingId = await seedAcceptedBooking(aircraftId, pilotEmail);

  // 1. The pilot reports a defect from the booking
  await page.goto(`/bookings/${bookingId}`);
  await page.getByRole("button", { name: "Report a defect" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("How serious is it?").selectOption("unsafe");
  await dialog.getByLabel("What's wrong?").fill("Oil on the left cowl");
  await dialog.getByRole("button", { name: "Send to the owner" }).click();
  await expect(page.getByText("Defect reported. The owner has been told.")).toBeVisible();

  // 2. The owner's to-do leads to it; the owner grounds the aircraft
  await owner.goto("/dashboard");
  await owner.getByRole("link", { name: `1 open defect on LZ-D${letters}` }).click();
  await expect(owner).toHaveURL(new RegExp(`/owner/aircraft/${aircraftId}/defects$`));
  await expect(owner.getByText("Oil on the left cowl")).toBeVisible();
  await expect(owner.getByText(`Reported by Pilot ${id}`, { exact: false })).toBeVisible();
  await owner.getByRole("button", { name: "Ground the aircraft" }).click();
  await expect(owner.getByText("This aircraft is grounded")).toBeVisible();

  // 3. The pilot is told and can't check out
  await page.goto(`/bookings/${bookingId}`);
  await expect(page.getByText(/The owner has grounded this aircraft/)).toBeVisible();
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page.getByText(/grounded by the owner, so it can't be checked out/)).toBeVisible();

  // 4. The owner marks the defect fixed
  await owner.getByPlaceholder("What was done (optional)").fill("Cowl resealed");
  await owner.getByRole("button", { name: "Mark as fixed" }).click();
  await expect(owner.getByText("No open defects.")).toBeVisible();
  await expect(owner.getByText("Cowl resealed")).toBeVisible();
  await ownerContext.close();
});
