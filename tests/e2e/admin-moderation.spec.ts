import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { PASSWORD, seedListedAircraft, signUp, unique } from "./helpers";

// A member reports a listing; an admin unlists it and suspends the owner, who can no longer
// log in; everything is in the audit log (ADM-2…4).
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

test("an admin handles a report: unlist, suspend, audit log", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const id = unique();
  const letters = id
    .replace(/[^a-z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  const ownerEmail = `owner-a-${id}@example.com`;
  const adminEmail = `admin-a-${id}@example.com`;
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await signUp(owner, `Owner ${id}`, ownerEmail);
  const aircraftId = await seedListedAircraft(ownerEmail, `LZ-A${letters}`);

  // A member reports the listing.
  await signUp(page, `Member ${id}`, `member-a-${id}@example.com`);
  await page.goto(`/aircraft/${aircraftId}`);
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await page.getByLabel("Reason").selectOption("misleading");
  await page.getByLabel("Details (optional)").fill("Photos are of another aircraft.");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thanks, we'll take a look.")).toBeVisible();

  // The admin sees it on the dashboard and in the queue.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signUp(admin, `Admin ${id}`, adminEmail);
  execFileSync("node", ["scripts/grant-admin.mjs", adminEmail], { stdio: "pipe" });
  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();
  // No SENTRY_DSN in tests: the test button says so.
  await admin.getByRole("button", { name: "Send a test error" }).click();
  await expect(admin.getByRole("alert").filter({ hasText: "SENTRY_DSN isn't set" })).toBeVisible();
  await admin.getByRole("link", { name: /Open reports/ }).click();
  // Other tests may run at the same time: work on this test's report only.
  const card = admin.getByRole("listitem").filter({ hasText: `LZ-A${letters}` });
  await expect(card.getByText("Photos are of another aircraft.")).toBeVisible();
  await card.getByRole("button", { name: "Unlist aircraft" }).click();
  await admin.getByLabel("Reason (for the audit log)").fill("Misleading photos");
  await admin.getByRole("dialog").getByRole("button", { name: "Unlist aircraft" }).click();
  await expect(card).toHaveCount(0); // the report is resolved too

  // Suspend the owner from their page in the members list.
  await admin.goto(`/admin/users?q=${encodeURIComponent(ownerEmail)}`);
  await admin.getByRole("link", { name: new RegExp(`Owner ${id}`) }).click();
  await admin.getByRole("button", { name: "Suspend member" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Suspend member" }).click();
  await expect(admin.getByText("Member suspended.")).toBeVisible();

  await admin.goto("/admin/audit?q=aircraft");
  await expect(admin.getByText("Misleading photos").first()).toBeVisible();

  // API usage (API-6): the limits, who went over them, requests per user and system.
  await admin.getByRole("link", { name: "API", exact: true }).click();
  await expect(admin.getByRole("heading", { name: "API usage", level: 1 })).toBeVisible();
  await expect(
    admin.getByText("App user (per token): 240 requests", { exact: false }),
  ).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Requests in the last 7 days" })).toBeVisible();
  await expectAccessible(admin);
  await adminContext.close();

  // The owner is logged out and can't log in again; the listing is gone.
  await owner.goto("/dashboard");
  await expect(owner).toHaveURL(/\/login/);
  await owner.getByLabel("Email").fill(ownerEmail);
  await owner.getByLabel("Password").fill(PASSWORD);
  await owner.getByRole("button", { name: "Log in" }).click();
  await expect(owner.getByText("This account is suspended.", { exact: false })).toBeVisible();
  await ownerContext.close();

  expect((await page.goto(`/aircraft/${aircraftId}`))?.status()).toBe(404);
});

test("an admin deletes a member for good; admins can't be deleted", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const id = unique();
  const memberEmail = `gone-${id}@example.com`;
  const adminEmail = `admin-d-${id}@example.com`;
  const otherAdminEmail = `admin-e-${id}@example.com`;
  const memberContext = await browser.newContext();
  await signUp(await memberContext.newPage(), `Gone ${id}`, memberEmail);
  await memberContext.close();
  const otherContext = await browser.newContext();
  await signUp(await otherContext.newPage(), `Other admin ${id}`, otherAdminEmail);
  await otherContext.close();
  execFileSync("node", ["scripts/grant-admin.mjs", otherAdminEmail], { stdio: "pipe" });

  await signUp(page, `Admin ${id}`, adminEmail);
  execFileSync("node", ["scripts/grant-admin.mjs", adminEmail], { stdio: "pipe" });

  // Another admin has no delete button.
  await page.goto(`/admin/users?q=${encodeURIComponent(otherAdminEmail)}`);
  await page.getByRole("link", { name: new RegExp(`Other admin ${id}`) }).click();
  await expect(page.getByText(otherAdminEmail)).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove admin rights" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete member" })).toHaveCount(0);

  await page.goto(`/admin/users?q=${encodeURIComponent(memberEmail)}`);
  await page.getByRole("link", { name: new RegExp(`Gone ${id}`) }).click();
  await page.getByRole("button", { name: "Delete member" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("This can't be undone", { exact: false })).toBeVisible();
  await dialog.getByLabel("Reason (for the audit log)").fill(`Asked by email ${id}`);
  await dialog.getByRole("button", { name: "Delete member" }).click();
  await expect(page.getByText("Member deleted.")).toBeVisible();
  await page.goto(`/admin/users?q=${encodeURIComponent(memberEmail)}`);
  await expect(page.getByText("No members found.")).toBeVisible();

  await page.goto(`/admin/audit?q=${encodeURIComponent(`Asked by email ${id}`)}`);
  await expect(page.getByText(`Asked by email ${id}`)).toBeVisible();

  // The account is gone: logging in fails.
  const loginContext = await browser.newContext();
  const login = await loginContext.newPage();
  await login.goto("/login");
  await login.getByLabel("Email").fill(memberEmail);
  await login.getByLabel("Password").fill(PASSWORD);
  await login.getByRole("button", { name: "Log in" }).click();
  await expect(login.getByText("Wrong email or password.")).toBeVisible();
  await loginContext.close();
});

test("an admin gives and removes admin rights from the member page", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const id = unique();
  const memberEmail = `helper-${id}@example.com`;
  const adminEmail = `admin-g-${id}@example.com`;
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signUp(member, `Helper ${id}`, memberEmail);
  await member.goto("/admin");
  await expect(member.getByText("Off the charts")).toBeVisible(); // not an admin: 404

  await signUp(page, `Admin ${id}`, adminEmail);
  execFileSync("node", ["scripts/grant-admin.mjs", adminEmail], { stdio: "pipe" });

  // Filters and search find the member; their page shows the account details.
  await page.goto("/admin/users?filter=unverified");
  await expect(page.getByRole("link", { name: /Email not confirmed \d+/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goto(`/admin/users?q=${encodeURIComponent(memberEmail)}`);
  await page.getByRole("link", { name: new RegExp(`Helper ${id}`) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: new RegExp(`Helper ${id}`) }),
  ).toBeVisible();
  await expect(page.getByText(memberEmail)).toBeVisible();
  await expect(page.getByText("Email and password")).toBeVisible();

  await page.getByRole("button", { name: "Make admin" }).click();
  await page.getByRole("dialog").getByLabel("Reason (for the audit log)").fill(`Helps ${id}`);
  await page.getByRole("dialog").getByRole("button", { name: "Make admin" }).click();
  await expect(page.getByText("Admin rights given.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Made admin")).toBeVisible();
  await expect(page.getByText(`“Helps ${id}”`)).toBeVisible();

  // The member now reaches the admin pages.
  await member.goto("/admin");
  await expect(member.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Remove admin rights" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove admin rights" }).click();
  await expect(page.getByText("Admin rights removed.").first()).toBeVisible();
  await member.goto("/admin");
  await expect(member.getByText("Off the charts")).toBeVisible();
  await memberContext.close();

  // You can't remove your own admin rights.
  await page.goto(`/admin/users?q=${encodeURIComponent(adminEmail)}`);
  await page.getByRole("link", { name: new RegExp(`Admin ${id}`) }).click();
  await expect(page.getByText("This is your own account")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove admin rights" })).toHaveCount(0);
});
