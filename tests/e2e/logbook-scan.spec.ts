import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { apiSignIn, signUp, unique } from "./helpers";

// Reading a two-page spread of a paper logbook (LOG-6): lines into drafts, the page totals
// checked, certify; and through the API. The AI is the local stand-in (fixtures/ocr-mock.mjs):
// four lines, one without a date, and a page total of 2:40 against 2:30 read.
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

const pdfPath = path.join(__dirname, "fixtures", "licence.pdf");

test("a pilot reads a paper logbook spread into the logbook", async ({ page, baseURL }) => {
  test.setTimeout(60_000);
  const id = unique();
  const email = `spread-${id}@example.com`;
  await signUp(page, `Pilot ${id}`, email);
  await page.goto("/logbook");
  await page.getByRole("link", { name: "Read a paper logbook page" }).click();
  await expect(page.getByRole("heading", { name: "Read a paper logbook page" })).toBeVisible();
  await page.getByRole("button", { name: "Read the pages" }).click();
  await expect(
    page.getByText("Upload the left page (or a photo of both pages) first."),
  ).toBeVisible();
  await page.getByLabel("Left page (or one photo of both pages)").setInputFiles(pdfPath);
  await page.getByLabel("Right page (optional)").setInputFiles(pdfPath);
  await expect(page.getByRole("link", { name: /licence\.pdf/ })).toHaveCount(2);
  await page.getByRole("button", { name: "Read the pages" }).click();

  // The result: three lines read, one not, and the total time that doesn't add up
  await expect(page.getByRole("heading", { name: "Read from your logbook page" })).toBeVisible();
  await expect(page.getByText("3 lines read into drafts.")).toBeVisible();
  await expect(page.getByText(/1 line couldn't be read/)).toBeVisible();
  await expect(page.getByText("Total time of flight: page 2:40, lines 2:30")).toBeVisible();
  await expect(page.getByRole("link", { name: "Left page" })).toBeVisible();
  await expectAccessible(page);

  // Certify the lines; each keeps a link to the scanned page
  await page.getByRole("button", { name: "Certify selected" }).click();
  await expect(page.getByText("3 entries certified.")).toBeVisible();
  await expect(page.getByText("2:30").first()).toBeVisible();
  await page.getByRole("link", { name: "2024-05-12" }).click();
  await expect(page.getByRole("link", { name: "Read from a scanned page" })).toBeVisible();

  // The same through the API
  const token = `Bearer ${await apiSignIn(baseURL, email)}`;
  const upload = async () => {
    const form = new FormData();
    form.append("file", new Blob([readFileSync(pdfPath)], { type: "application/pdf" }), "p.pdf");
    const res = await fetch(new URL("/api/v1/documents", baseURL), {
      method: "POST",
      headers: { authorization: token },
      body: form,
    });
    return (await res.json()).data.id as string;
  };
  const read = await fetch(new URL("/api/v1/me/logbook/scans", baseURL), {
    method: "POST",
    headers: { authorization: token, "content-type": "application/json" },
    body: JSON.stringify({ leftDocumentId: await upload() }),
  });
  expect(read.status).toBe(201);
  const spread = (await read.json()).data;
  expect(spread).toMatchObject({
    linesRead: 3,
    linesSkipped: 1,
    differences: [{ column: "totalMinutes", written: 160, lines: 150 }],
  });
  expect(spread.entries.map((e: { status: string }) => e.status)).toEqual([
    "draft",
    "draft",
    "draft",
  ]);
});
