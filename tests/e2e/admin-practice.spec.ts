import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { signUp, unique } from "./helpers";

// Practice flights: an admin opens a booking that can be checked out at once, tries the
// check-out, and removes the practice data again.
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

test("an admin tries the check-out on a practice flight", async ({ page }) => {
  const id = unique();
  const email = `practice-${id}@example.com`;
  await signUp(page, `Admin ${id}`, email);
  execFileSync("node", ["scripts/grant-admin.mjs", email], { stdio: "pipe" });

  await page.goto("/admin/practice");
  await expect(page.getByRole("heading", { name: "Practice flight", level: 1 })).toBeVisible();
  await expect(page.getByText("No open practice flight.")).toBeVisible();
  await expectAccessible(page);

  // Straight to the booking, where the check-out is open
  await page.getByRole("button", { name: "Start a practice flight" }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  const bookingUrl = page.url();
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page).toHaveURL(/\/log$/);
  await expect(page.getByRole("heading", { name: "Flight log", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save check-out" })).toBeVisible();

  // The admin page links back to it, then removes it
  await page.goto("/admin/practice");
  await expect(page.getByText(/ · In progress$/)).toBeVisible();
  expect(await page.getByLabel("Link to the booking").inputValue()).toMatch(
    new RegExp(`${new URL(bookingUrl).pathname}$`),
  );
  await page.getByRole("button", { name: "Remove practice data" }).click();
  await expect(page.getByText("Practice data removed.")).toBeVisible();
  await expect(page.getByText("No open practice flight.")).toBeVisible();
});
