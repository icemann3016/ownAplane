import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { signUp, unique, userId, withDb } from "./helpers";

// Plans in test mode (SUB-4…8): pricing, subscribing through the test checkout, upgrading now,
// downgrading at the renewal, a failed payment's grace, cancelling, and buying AI credits.
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

test("an owner tries the plans without paying anything", async ({ page }) => {
  test.setTimeout(90_000);
  const id = unique();
  const email = `plans-${id}@example.com`;
  await signUp(page, `Owner ${id}`, email);

  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Pricing", level: 1 })).toBeVisible();
  await expect(page.getByText("€9 / month")).toBeVisible();
  await page.getByRole("link", { name: "Yearly" }).click();
  await expect(page.getByText("€390 / year")).toBeVisible();
  await expectAccessible(page);

  // Subscribe to Owner, monthly, through the test checkout
  await page.goto("/account/billing?interval=month");
  await expect(page.getByText("Test mode:", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Choose Owner" }).click();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByText("€9")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await expect(page.getByText("Payment done. Thank you!")).toBeVisible();
  await expect(page.getByText(/Renews on .* for €9\./)).toBeVisible();

  // Upgrade to Fleet now (prorated), then switch to Owner yearly at the renewal
  await page.getByRole("button", { name: /Upgrade to Fleet now/ }).click();
  await expect(page.getByText("Your new plan starts now.")).toBeVisible();
  await expect(page.getByText("Listed aircraft: 0 of 10")).toBeVisible();
  await page.getByRole("link", { name: "Yearly" }).click();
  await expect(page).toHaveURL(/interval=year/);
  await expect(page.getByText("€390 / year")).toBeVisible();
  await page.getByRole("button", { name: /Switch to Owner on/ }).click();
  await expect(page.getByText(/Changes to Owner \(Yearly\)/)).toBeVisible();
  await page.getByRole("button", { name: "End the billing period now" }).click();
  await expect(page.getByText("The billing period ended and the plan renewed.")).toBeVisible();
  await expect(page.getByText(/Renews on .* for €90\./)).toBeVisible();

  // A failed renewal keeps the plan for 7 days; paying fixes it
  await page.getByRole("button", { name: "Make the next payment fail" }).click();
  await page.getByRole("button", { name: "End the billing period now" }).click();
  await expect(page.getByText(/The last payment didn't go through/)).toBeVisible();
  await page.getByRole("button", { name: "Pay now" }).click();
  await expect(page.getByText(/Renews on/)).toBeVisible();

  // Cancel at the end of the period, and change one's mind
  await page.getByRole("button", { name: "Cancel at the end of the period" }).click();
  await expect(page.getByText(/after that you're on Free/)).toBeVisible();
  await page.getByRole("button", { name: "Keep my current plan" }).click();
  await expect(page.getByText(/Renews on/)).toBeVisible();

  // AI reads: 5 welcome credits + 20 a month with Owner, then a pack of 50
  await expect(page.getByText("25 reads left")).toBeVisible();
  await page.getByRole("button", { name: /Buy 50 credits/ }).click();
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await expect(page.getByText("Payment done. Thank you!")).toBeVisible();
  await expect(page.getByText("75 reads left")).toBeVisible();
  await expectAccessible(page);

  const payments = await withDb(async (sql) => {
    const user = await userId(sql, email);
    return sql<{ status: string }[]>`
      select status from billing_payments where user_id = ${user} order by created_at`;
  });
  expect(payments.map((p) => p.status)).toEqual(["paid", "paid", "paid", "failed", "paid", "paid"]);
});

test("a pilot uses the Pilot Plus features (the beta includes them)", async ({ page }) => {
  const id = unique();
  await signUp(page, `Pilot ${id}`, `plus-${id}@example.com`);

  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Pilot Plus" })).toBeVisible();
  await expect(page.getByText("€4 / month")).toBeVisible();

  await page.goto("/logbook");
  await page.getByRole("link", { name: "Currency" }).click();
  await expect(page.getByRole("heading", { name: "Currency", level: 1 })).toBeVisible();
  await expect(
    page.getByText("not current (0 of 3 landings in the last 90 days)").first(),
  ).toBeVisible();
  await expectAccessible(page);

  await page.goto("/logbook/stats");
  await expect(page.getByRole("heading", { name: "Flying statistics", level: 1 })).toBeVisible();
  await expect(page.getByText("No certified flights yet.").first()).toBeVisible();
  await expectAccessible(page);

  // Bookings in one's own calendar: a private iCal link
  await page.goto("/bookings");
  await page.getByRole("button", { name: "Create a calendar link" }).click();
  const link = await page.getByLabel("Calendar link").inputValue();
  expect(link).toMatch(/\/api\/v1\/calendars\/bookings\/[0-9a-f]{48}\.ics$/);
  const response = await page.request.get(new URL(link).pathname);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/calendar");
  expect(await response.text()).toContain("BEGIN:VCALENDAR");
  await page.getByRole("button", { name: "Remove link" }).click();
  await expect(page.getByRole("button", { name: "Create a calendar link" })).toBeVisible();
  expect((await page.request.get(new URL(link).pathname)).status()).toBe(404);
});
