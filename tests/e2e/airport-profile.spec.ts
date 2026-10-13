import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { signUp, unique, withDb } from "./helpers";

// An airfield's manager fills in its profile (hours in local time, runways, radio, services and
// prices) and anyone, logged out, sees its public page with the hours in UTC (APT-1, M16).
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

test("a manager keeps the airfield's page and everyone sees it", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const id = unique();
  const name = `Riverside ${id}`;
  const ident = `ZP-${id.replace(/[^a-z0-9]/gi, "").slice(-8)}`.toUpperCase();
  const email = `apt-manager-${id}@example.com`;
  await signUp(page, `Manager ${id}`, email);
  // A verified airfield with this user as its manager (step 1 is tested in airport-team).
  await withDb(async (sql) => {
    const [{ id: userId }] = await sql<
      { id: string }[]
    >`select id from users where email = ${email}`;
    await sql`insert into airports (ident, type, name, municipality, country, latitude, longitude, elevation_ft, timezone)
      values (${ident}, 'small_airport', ${name}, 'Ruse', 'BG', 43.7, 26.0, 600, 'Europe/Sofia')`;
    await sql`insert into airport_operators (airport_ident) values (${ident})`;
    await sql`insert into airport_members (airport_ident, user_id, role)
      values (${ident}, ${userId}, 'manager')`;
  });
  const base = `/airports/manage/${ident}`;

  // 1. Profile
  await page.goto(`${base}/profile`);
  await page
    .getByLabel("About the airfield")
    .fill("Grass strip by the Danube. Left-hand circuits.");
  await page.getByLabel("Pilots need PPR to land here").check();
  await page.getByLabel("Notice needed (hours)").fill("24");
  await page.getByLabel("Email").fill("ops@riverside.example");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expectAccessible(page);

  // 2. Opening hours: Monday 08:00–18:00 local, the same every day; a closure
  await page.getByRole("link", { name: "Opening hours" }).click();
  await page.getByRole("checkbox", { name: "Monday" }).check();
  await page.getByRole("button", { name: "Use Monday's hours for every day" }).click();
  await page.getByRole("button", { name: "Save opening hours" }).click();
  await expect(page.getByText("Opening hours saved.")).toBeVisible();
  // Sofia is UTC+3 in summer and UTC+2 in winter.
  await expect(page.getByText(/0[56]:00–1[56]:00 UTC/).first()).toBeVisible();
  await page.getByLabel("Closed from").fill("2031-01-01");
  await page.getByLabel("Until (inclusive)").fill("2031-01-02");
  await page.getByLabel("Reason (shown to pilots)").fill("New Year");
  await page.getByRole("button", { name: "Add closure" }).click();
  await expect(page.getByText("Closure added.")).toBeVisible();
  await expectAccessible(page);

  // 3. Runways and radio
  await page.getByRole("link", { name: "Runways & radio" }).click();
  await page.getByLabel("Runway", { exact: true }).fill("09/27");
  await page.getByLabel("Length (m)").fill("800");
  await page.getByLabel("Width (m)").fill("20");
  await page.getByLabel("Surface").selectOption("grass");
  await page.getByLabel("Lit at night").check();
  await page.getByRole("button", { name: "Add runway" }).click();
  await expect(page.getByText("Runway added.")).toBeVisible();
  await page.getByLabel("Type").fill("a/g");
  await page.getByLabel("MHz").fill("123.500");
  await page.getByLabel("Callsign or note").fill("Riverside Radio");
  await page.getByRole("button", { name: "Add frequency" }).click();
  await expect(page.getByText("Frequency added.")).toBeVisible();
  await expectAccessible(page);

  // 4. Services & prices: a landing charge by weight, fuel by the litre, something on request
  await page.getByRole("link", { name: "Services & prices" }).click();
  await page.getByLabel("Price (EUR)").fill("15");
  await page.getByLabel("Up to MTOM (kg)").fill("1000");
  await page.getByRole("button", { name: "Add to the list" }).click();
  await expect(page.getByText("Added to the list.")).toBeVisible();
  await page.getByLabel("Service").selectOption("fuel");
  await expect(page.getByLabel("Per")).toHaveValue("litre");
  await page.getByLabel("Price (EUR)").fill("2,859");
  await page.getByRole("button", { name: "Add to the list" }).click();
  await expect(page.getByText("€2.859 per litre")).toBeVisible();
  await page.getByLabel("Service").selectOption("other");
  await page.getByLabel("Name", { exact: true }).fill("Tie-downs");
  await page.getByRole("button", { name: "Add to the list" }).click();
  await expect(page.getByText("Price on request")).toBeVisible();
  // The landing charge goes up.
  await page.getByRole("link", { name: "Edit Up to 1,000 kg MTOM" }).click();
  await expect(page.getByRole("heading", { name: "Change a service" })).toBeVisible();
  await page.getByLabel("Price (EUR)").fill("18");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("€18.00 per landing")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await expectAccessible(page);

  // 5. Anyone sees the public page, logged out
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/airports/${ident}`);
  await expect(visitor.getByRole("heading", { name: `${ident} ${name}`, level: 1 })).toBeVisible();
  await expect(visitor.getByText("PPR required, 24 h notice")).toBeVisible();
  await expect(visitor.getByText("Grass strip by the Danube. Left-hand circuits.")).toBeVisible();
  await expect(visitor.getByText(/0[56]:00–1[56]:00 UTC/).first()).toBeVisible();
  await expect(visitor.getByText("800 × 20 m · Grass · lit")).toBeVisible();
  await expect(visitor.getByText("123.500")).toBeVisible();
  await expect(visitor.getByText("Riverside Radio")).toBeVisible();
  await expect(visitor.getByText("€18.00 per landing")).toBeVisible();
  await expect(visitor.getByText("Up to 1,000 kg MTOM")).toBeVisible();
  await expect(visitor.getByText("AVGAS 100LL")).toBeVisible();
  await expect(visitor.getByText("€2.859 per litre")).toBeVisible();
  await expect(visitor.getByText("Tie-downs")).toBeVisible();
  await expect(visitor.getByRole("link", { name: "ops@riverside.example" })).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Edit this page" })).toHaveCount(0);
  await expectAccessible(visitor);

  // The index lists it.
  await visitor.goto("/airports");
  await visitor.getByRole("link", { name: new RegExp(name) }).click();
  await expect(visitor).toHaveURL(new RegExp(`/airports/${ident}$`));
  await visitorContext.close();

  // Its manager gets a way back to editing.
  await page.goto(`/airports/${ident}`);
  await expect(page.getByRole("link", { name: "Edit this page" })).toBeVisible();
});
