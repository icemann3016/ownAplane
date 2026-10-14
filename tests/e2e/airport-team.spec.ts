import { execFileSync } from "node:child_process";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { signUp, unique, withDb } from "./helpers";

// Someone from an airfield claims it with a document; an admin verifies the claim; the new
// manager invites a colleague, who joins the team with the link (APT-1, M16).
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

const pdf = path.join(__dirname, "fixtures", "licence.pdf");

test("an airfield is claimed, verified and gets a team", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const id = unique();
  const name = `Testfield ${id}`;
  const ident = `ZZ-${id.replace(/[^a-z0-9]/gi, "").slice(-8)}`.toUpperCase();
  // A fresh airfield of its own, so runs never share one.
  await withDb(
    (sql) => sql`insert into airports (ident, type, name, country, latitude, longitude, timezone)
      values (${ident}, 'small_airport', ${name}, 'BG', 42.5, 24.5, 'Europe/Sofia')`,
  );
  const managerEmail = `manager-${id}@example.com`;
  const staffEmail = `staff-${id}@example.com`;
  await signUp(page, `Manager ${id}`, managerEmail);

  // 1. The claim, with a document as proof
  await page.goto("/airports/manage");
  await expect(page.getByRole("heading", { name: "Airports", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Claim an airfield" }).click();
  await page.getByRole("combobox", { name: "Airfield" }).fill(name);
  await page.getByRole("option", { name: new RegExp(name) }).click();
  await page.getByLabel("Your position").fill("Airport manager");
  await expect(page.getByRole("radio", { name: /A document/ })).toBeChecked();
  await page.locator('input[type="file"]').setInputFiles(pdf);
  await expect(page.getByRole("link", { name: /licence\.pdf/ })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Send claim" }).click();
  await expect(page).toHaveURL(/\/airports\/manage\?filed=pending$/);
  await expect(page.getByText(/Claim sent\. An admin checks it/)).toBeVisible();
  await expect(page.getByText("Waiting for an admin")).toBeVisible();
  await expectAccessible(page);

  // 2. An admin verifies it
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const adminEmail = `admin-apt-${id}@example.com`;
  await signUp(admin, `Admin ${id}`, adminEmail);
  execFileSync("node", ["scripts/grant-admin.mjs", adminEmail], { stdio: "pipe" });
  await admin.goto("/admin/verifications");
  await admin.getByRole("link", { name: new RegExp(`${name} · Manager ${id}`) }).click();
  await expect(admin.getByRole("heading", { name: `Claim for ${ident} ${name}` })).toBeVisible();
  await expect(admin.getByText("Position: Airport manager")).toBeVisible();
  await expect(admin.getByRole("link", { name: /Open licence\.pdf/ })).toBeVisible();
  await expectAccessible(admin);
  await admin.getByRole("button", { name: `Verify ${ident} ${name}` }).click();
  await expect(admin.getByText(/^Verified on .* UTC$/)).toBeVisible();
  await adminContext.close();

  // 3. The new manager invites a colleague
  await page.goto("/airports/manage");
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name: `${ident} ${name}`, level: 1 })).toBeVisible();
  // The airfield opens on its movements board; the team has its own tab.
  await expect(page.getByRole("heading", { name: "Movements" })).toBeVisible();
  await page.getByRole("link", { name: "Team", exact: true }).click();
  await expect(page).toHaveURL(/\/team$/);
  await page.getByLabel("Email").fill(staffEmail);
  await page.getByRole("button", { name: "Send invitation" }).click();
  const link = page.getByLabel("Invitation link (shown once)");
  await expect(link).toHaveValue(/\/airports\/invite\/[0-9a-f]{64}$/);
  const invitation = await link.inputValue();
  await expect(page.getByText(staffEmail, { exact: true })).toBeVisible();
  await expectAccessible(page);

  // 4. The colleague joins with the link; the team shows both
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await signUp(staff, `Staff ${id}`, staffEmail);
  await staff.goto(new URL(invitation).pathname);
  await expect(
    staff.getByText(`You're invited to the team of ${ident} ${name} as Staff.`),
  ).toBeVisible();
  await staff.getByRole("button", { name: "Join the team" }).click();
  await expect(staff).toHaveURL(new RegExp(`/airports/manage/${encodeURIComponent(ident)}$`));
  await staff.getByRole("link", { name: "Team", exact: true }).click();
  await expect(staff.getByText(`Manager ${id}`)).toBeVisible();
  await expect(staff.getByRole("button", { name: "Send invitation" })).toHaveCount(0);
  await staffContext.close();

  // 5. The manager makes them a manager too
  await page.reload();
  await page.getByRole("button", { name: "Make manager" }).click();
  await expect(page.getByRole("button", { name: "Make staff" })).toBeVisible();
  await expect(page.getByText(/^Manager · since/)).toHaveCount(2);
});

// Airfield accounts aren't pilot accounts (Zlati, 2026-10-13): the welcome step offers the
// airfield, a pilot is told to use another account, and an airfield account can't turn pilot.
test("airfield accounts and pilot accounts stay apart", async ({ page }) => {
  const id = unique();
  await signUp(page, `Pilot ${id}`, `pilot-apart-${id}@example.com`);
  await page.getByRole("button", { name: /I'm a pilot/ }).click();
  await expect(page.getByRole("button", { name: /I'm a pilot/ })).toHaveCount(0);
  await page.goto("/airports/manage/claim");
  await expect(page.getByText(/This is a pilot account/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send claim" })).toHaveCount(0);
  await page.context().clearCookies();

  await signUp(page, `Airfield ${id}`, `airfield-apart-${id}@example.com`);
  await page.getByRole("button", { name: /I run an airfield/ }).click();
  await expect(page).toHaveURL(/\/airports\/manage$/);
  // A claim makes it an airfield account: no pilot switch any more, owner still possible.
  await withDb(async (sql) => {
    const [{ id: userId }] = await sql<
      { id: string }[]
    >`select id from users where email = ${`airfield-apart-${id}@example.com`}`;
    await sql`insert into airport_claims (airport_ident, user_id, position, email)
      values ('LBSF', ${userId}, 'Manager', ${`ops-${id}@sofia-airport.example`})`;
  });
  await page.goto("/account");
  await expect(page.getByText(/This account runs an airfield/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch on: I'm a pilot" })).toHaveCount(0);
  await page.getByRole("button", { name: "Switch on: I own an aircraft" }).click();
  await expect(page.getByRole("button", { name: "Switch off: I own an aircraft" })).toBeVisible();
  await page.goto("/welcome?step=roles");
  await expect(page.getByRole("button", { name: /I'm a pilot/ })).toBeDisabled();
  await expectAccessible(page);
});
