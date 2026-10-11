import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { apiSignIn, signUp, unique } from "./helpers";

// The pilot's EASA logbook (LOG-1…5, LOG-8): totals brought forward, a flight, certifying,
// correcting, striking through, totals, print and CSV, and the same through the API.
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

test("a pilot keeps an EASA logbook", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const id = unique();
  const email = `logbook-${id}@example.com`;
  await signUp(page, `Pilot ${id}`, email);
  await page.goto("/logbook");
  await expect(page.getByRole("heading", { name: "Logbook", level: 1 })).toBeVisible();
  await expect(page.getByText("Your logbook is empty.")).toBeVisible();

  // 1. Totals from the paper logbook, then a flight
  await page.getByRole("link", { name: "Totals brought forward" }).click();
  await page.getByLabel("Date").fill("2025-12-31");
  await page.getByLabel("Total time of flight").fill("250:30");
  await page.getByLabel("PIC", { exact: true }).fill("200:00");
  await page.getByLabel("Landings Day").fill("400");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/logbook$/);

  await page.getByRole("link", { name: "Add flight" }).click();
  await expect(page.getByLabel("Name of PIC")).toHaveValue(`Pilot ${id}`);
  await page.getByLabel("Date").fill(yesterday());
  await page.getByLabel("Departure – Place").fill("LBSF");
  await page.getByLabel("Departure – Time (UTC)").fill("08:00");
  await page.getByLabel("Arrival – Place").fill("LBPD");
  await page.getByLabel("Arrival – Time (UTC)").fill("09:10");
  await page.getByLabel("Type").fill("C172S");
  await page.getByLabel("Registration").fill("LZ-ABC");
  await page.getByLabel("Single-pilot time SE").fill("1:10");
  await page.getByLabel("Total time of flight").fill("1:10");
  await expect(page.getByText("No PIC, co-pilot, dual or instructor time.")).toBeVisible();
  await page.getByLabel("PIC", { exact: true }).fill("1.5");
  await expect(
    page.getByText("PIC + co-pilot + dual time is more than the total time."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Can't be more than the total time of flight.")).toBeVisible();
  await page.getByLabel("PIC", { exact: true }).fill("1:10");
  await page.getByLabel("Landings Day").fill("1");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/logbook$/);

  // 2. Certify both drafts
  await page.getByRole("button", { name: "Certify selected" }).click();
  await expect(page.getByText("2 entries certified.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("251:40")).toBeVisible();
  await expectAccessible(page);

  // 3. Correct the flight: the original stays, struck through
  await page.getByRole("link", { name: yesterday() }).click();
  await expect(page.getByText("Certified", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Correct this entry" }).click();
  await expect(page.getByRole("heading", { name: "Correct an entry" })).toBeVisible();
  for (const label of ["Single-pilot time SE", "Total time of flight"]) {
    await page.getByLabel(label).fill("1:15");
  }
  await page.getByLabel("PIC", { exact: true }).fill("1:15");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Certify selected" }).click();
  await expect(page.getByText("1 entry certified.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("251:45")).toBeVisible();
  await expect(page.getByText("Corrected", { exact: true })).toBeVisible();

  // 4. Strike an entry through
  const row = page.getByRole("row").filter({ hasText: "1:15" });
  await row.getByRole("link").click();
  await page.getByRole("button", { name: "Strike through" }).click();
  await page.getByLabel("Why").fill("Entered twice");
  await page.getByRole("dialog").getByRole("button", { name: "Strike through" }).click();
  await expect(page.getByText("Struck through: Entered twice")).toBeVisible();

  // 5. Print and CSV
  await page.goto("/logbook/print");
  await expect(page.getByRole("heading", { name: "Pilot logbook" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "LZ-ABC" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Total time", exact: true })).toBeVisible();
  const csv = await page.request.get("/logbook/export");
  expect(await csv.text()).toContain("kind,status,date,departure_place");

  // 6. The same logbook through the API
  const token = `Bearer ${await apiSignIn(baseURL, email)}`;
  const api = (path: string, init: { method?: string; body?: unknown } = {}) =>
    fetch(new URL(path, baseURL), {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        authorization: token,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  const totals = (await (await api("/api/v1/me/logbook/totals")).json()).data;
  expect(totals.toDate).toMatchObject({ totalMinutes: 250 * 60 + 30, landingsDay: 400 });
  const missing = await api("/api/v1/me/logbook", {
    body: { kind: "fstd", date: yesterday(), fstdType: "ALSIM AL42" },
  });
  expect((await missing.json()).error.fields).toHaveProperty("fstdMinutes");
  const created = await api("/api/v1/me/logbook", {
    body: { kind: "fstd", date: yesterday(), fstdType: "ALSIM AL42", fstdMinutes: 120 },
  });
  const sim = (await created.json()).data;
  expect(sim).toMatchObject({
    kind: "fstd",
    status: "draft",
    fstdMinutes: 120,
    totalMinutes: null,
  });
  const certified = await api("/api/v1/me/logbook/certify", { body: { ids: [sim.id] } });
  expect((await certified.json()).data).toEqual({ certified: 1 });
  const locked = await api(`/api/v1/me/logbook/${sim.id}`, { method: "DELETE" });
  expect((await locked.json()).error.details.reason).toBe("not_editable");
  const list = (await (await api("/api/v1/me/logbook")).json()).data;
  expect(list.map((e: { status: string }) => e.status)).toContain("superseded");

  // 7. The experience on the credentials page comes from the logbook (LOG-7)
  await page.goto("/account/credentials");
  await page.getByRole("button", { name: "Switch on pilot role" }).click();
  await expect(page.getByText("From your logbook: 250.5 h total, 200 h PIC")).toBeVisible();
  await page.getByRole("button", { name: "Use these" }).click();
  await expect(page.getByLabel("Total hours")).toHaveValue("250.5");
});
