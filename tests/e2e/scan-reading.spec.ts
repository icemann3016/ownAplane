import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { apiSignIn, signUp, unique, userId, withDb } from "./helpers";

// Reading a licence and a medical scan into the form (VER-9), on the website and through the
// API. The AI is a local stand-in (tests/e2e/fixtures/ocr-mock.mjs) with a fixed reading.
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

const pdfPath = path.join(__dirname, "fixtures", "licence.pdf");

test("a pilot lets the app fill in a licence and a medical from the scans", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const id = unique();
  const email = `scan-${id}@example.com`;
  await signUp(page, `Pilot ${id}`, email);
  await page.goto("/account/credentials");
  await page.getByRole("button", { name: "Switch on pilot role" }).click();

  // 1. Licence: upload, read, check, and add the ratings found on it
  await page.getByRole("button", { name: "Add licence" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Upload the scan first")).toBeVisible();
  await dialog.getByLabel("Scan or photo").setInputFiles(pdfPath);
  await expect(dialog.getByText(/sent to our AI provider/)).toBeVisible();
  await dialog.getByRole("button", { name: "Fill in from the scan" }).click();
  await expect(dialog.getByText("Filled in from the scan.")).toBeVisible();
  await expect(dialog.getByLabel("Licence number")).toHaveValue("BG.FCL.PPL.0042");
  await expect(dialog.getByLabel("Issuing country")).toHaveValue("BG");
  await expect(dialog.getByLabel("Date of issue")).toHaveValue("2019-05-14");
  const found = dialog.getByRole("group", { name: "Also on the licence" });
  await expect(found.getByLabel(/valid until 2027-05-31/)).toBeChecked();
  await expectAccessible(page);
  await found.getByRole("button", { name: "Add the selected ratings" }).click();
  await expect(dialog.getByText("2 ratings added", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: "BG.FCL.PPL.0042" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Night", level: 3 })).toBeVisible();

  // 2. Medical: read only after agreeing; the class still valid is chosen
  await page.getByRole("button", { name: "Add medical" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Scan or photo").setInputFiles(pdfPath);
  await expect(dialog.getByText(/is health data/)).toBeVisible();
  await dialog.getByRole("button", { name: "Agree and fill in from the scan" }).click();
  await expect(dialog.getByText("Filled in from the scan.")).toBeVisible();
  await expect(dialog.getByLabel("Class")).toHaveValue("class2");
  await expect(dialog.getByLabel("Valid until")).toHaveValue("2030-06-30");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  // 3. Each read is logged without content; the medical with the time of consent
  const reads = await withDb(async (sql) => {
    const user = await userId(sql, email);
    return sql<{ kind: string; consent: boolean }[]>`
      select kind, consent_at is not null as consent from document_reads
      where user_id = ${user} order by created_at`;
  });
  expect(reads).toEqual([
    { kind: "licence", consent: false },
    { kind: "medical", consent: true },
  ]);

  // 4. The same through the API: a medical needs consent
  const token = `Bearer ${await apiSignIn(baseURL, email)}`;
  const form = new FormData();
  form.append("file", new Blob([readFileSync(pdfPath)], { type: "application/pdf" }), "m.pdf");
  const uploaded = await fetch(new URL("/api/v1/documents", baseURL), {
    method: "POST",
    headers: { authorization: token },
    body: form,
  });
  const docId = (await uploaded.json()).data.id;
  const read = (body: unknown) =>
    fetch(new URL(`/api/v1/documents/${docId}/read`, baseURL), {
      method: "POST",
      headers: { authorization: token, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const noConsent = await read({ as: "medical" });
  expect((await noConsent.json()).error.fields).toHaveProperty("consent");
  const medical = await read({ as: "medical", consent: true });
  expect((await medical.json()).data).toMatchObject({
    as: "medical",
    medical: { class: "class2", issuingState: "BG", validUntil: "2030-06-30" },
    licence: null,
  });
  const licence = await read({ as: "licence" });
  expect((await licence.json()).data.licence).toMatchObject({
    type: "ppl_a",
    number: "BG.FCL.PPL.0042",
    ratings: [
      { kind: "class", code: "SEP_LAND", expiresOn: "2027-05-31" },
      { kind: "privilege", code: "NIGHT", expiresOn: null },
    ],
  });

  // 5. Every read took one of the 5 welcome credits: one left, then 402 no_credits
  const plan = async () =>
    (
      await (
        await fetch(new URL("/api/v1/me/plan", baseURL), { headers: { authorization: token } })
      ).json()
    ).data;
  expect((await plan()).aiCredits).toMatchObject({ available: 1, balance: 1 });
  expect((await read({ as: "licence" })).status).toBe(200);
  const none = await read({ as: "licence" });
  expect(none.status).toBe(402);
  expect((await none.json()).error.details).toEqual({ reason: "no_credits" });
});
