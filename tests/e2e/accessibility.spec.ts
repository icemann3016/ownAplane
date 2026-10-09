import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import {
  seedCompletedBooking,
  seedListedAircraft,
  seedVerifiedPilot,
  signUp,
  unique,
} from "./helpers";

// Accessibility basics on the main flows (KAN-71): sign-up, search, booking, review.
test("public pages meet the basics", async ({ page }) => {
  for (const path of [
    "/",
    "/signup",
    "/login",
    "/search",
    "/help",
    "/help/getting-started",
    "/help/calendar-sync",
  ]) {
    await page.goto(path);
    await expectAccessible(page);
  }
});

test("dark mode has enough contrast too", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  for (const path of ["/", "/signup", "/search", "/help/getting-started", "/terms"]) {
    await page.goto(path);
    await expectAccessible(page);
  }
});

test("the skip link jumps to the content", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard navigation");
  await page.goto("/help");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("logged-in flows meet the basics", async ({ page, browser }) => {
  test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");
  test.setTimeout(90_000);
  const id = unique();
  const letters = id
    .replace(/[^a-z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  const ownerEmail = `owner-y-${id}@example.com`;
  const pilotEmail = `pilot-y-${id}@example.com`;
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await signUp(owner, `Owner ${id}`, ownerEmail);
  const aircraftId = await seedListedAircraft(ownerEmail, `LZ-Y${letters}`);
  await ownerContext.close();
  await signUp(page, `Pilot ${id}`, pilotEmail);
  await seedVerifiedPilot(pilotEmail);
  const bookingId = await seedCompletedBooking(aircraftId, pilotEmail);
  for (const path of [
    "/dashboard",
    "/account",
    "/account/credentials",
    `/aircraft/${aircraftId}`,
    `/aircraft/${aircraftId}/book`,
    `/bookings/${bookingId}`,
    "/bookings",
    "/messages",
    "/notifications",
  ]) {
    await page.goto(path);
    await expectAccessible(page);
  }
});
