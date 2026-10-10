import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { seedListedAircraft, signUp, unique, withDb } from "./helpers";

// Favourite aircraft and saved searches with alerts (SRC-6).
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

const letters = (id: string) =>
  id
    .replace(/[^a-z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");

test("a pilot keeps favourites and gets told about new aircraft for a saved search", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const id = unique();
  const ownerEmail = `saved-owner-${id}@example.com`;
  const ownerContext = await browser.newContext();
  await signUp(await ownerContext.newPage(), `Owner ${id}`, ownerEmail);
  await ownerContext.close();
  const aircraftId = await seedListedAircraft(ownerEmail, `LZ-F${letters(id)}`);
  await signUp(page, `Pilot ${id}`, `saved-pilot-${id}@example.com`);

  // 1. Favourite an aircraft from its page
  await page.goto(`/aircraft/${aircraftId}`);
  await page.getByRole("button", { name: "Add to favourites" }).click();
  await expect(page.getByRole("button", { name: "Remove from favourites" })).toBeVisible();

  // 2. Save a search near its base, with alerts
  await page.goto("/search?airport=LBSF&radius=25");
  await page.getByRole("button", { name: "Save this search" }).click();
  await page.getByLabel("Name").fill(`Sofia ${id}`);
  await page.getByRole("button", { name: "Save search" }).click();
  await expect(page.getByText("Search saved.")).toBeVisible();

  await page.goto("/saved");
  await expect(page.getByRole("heading", { name: "Saved", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cessna 172S" }).first()).toBeVisible();
  await expect(page.getByText(`Sofia ${id}`)).toBeVisible();
  await expectAccessible(page);

  // 3. An alert (made by the daily job, tested in tests/db/saved.test.ts) links to the results
  await withDb(
    (sql) => sql`
      insert into notifications (user_id, type, saved_search_id)
      select user_id, 'saved_search', id from saved_searches where name = ${`Sofia ${id}`}`,
  );
  await page.goto("/notifications");
  const alert = page.getByRole("link", { name: new RegExp(`saved search “Sofia ${id}”`) });
  await expect(alert).toBeVisible();
  await alert.click();
  await expect(page).toHaveURL(/\/search\?airport=LBSF&radius=25$/);

  // 4. Alerts off, then remove the search and the favourite
  await page.goto("/saved");
  await page.getByRole("button", { name: "Turn alerts off" }).click();
  await expect(page.getByText("Alerts off")).toBeVisible();
  await page.getByRole("button", { name: `Remove the saved search Sofia ${id}` }).click();
  await expect(page.getByText(`Sofia ${id}`)).toHaveCount(0);
  await page
    .getByRole("button", { name: /^Remove Cessna 172S from favourites/ })
    .first()
    .click();
  await expect(page.getByText(/No favourites yet/)).toBeVisible();
});
