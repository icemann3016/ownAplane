import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { apiSignIn, signUp, unique } from "./helpers";

// Pilot credentials through the API (API-3, VER-1…3): upload the scans, add licence, rating and
// medical, experience and type hours; documents are private.
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

const pdf = readFileSync(path.join(__dirname, "fixtures", "licence.pdf"));

test("a pilot keeps their credentials up to date through the API", async ({ browser, baseURL }) => {
  test.setTimeout(60_000);
  const id = unique();
  const email = `api-cred-${id}@example.com`;
  const otherEmail = `api-cred-other-${id}@example.com`;
  for (const [name, address] of [
    [`Pilot ${id}`, email],
    [`Other ${id}`, otherEmail],
  ] as const) {
    const context = await browser.newContext();
    await signUp(await context.newPage(), name, address);
    await context.close();
  }
  const token = `Bearer ${await apiSignIn(baseURL, email)}`;
  const other = `Bearer ${await apiSignIn(baseURL, otherEmail)}`;
  const call = (route: string, init: { method?: string; body?: unknown; auth?: string } = {}) =>
    fetch(new URL(route, baseURL), {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        authorization: init.auth ?? token,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  const upload = (bytes: Uint8Array, name: string, type: string) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
    return fetch(new URL("/api/v1/documents", baseURL), {
      method: "POST",
      headers: { authorization: token },
      body: form,
    });
  };

  // 1. Upload the scan: only real PDFs and images; private to the pilot
  const bad = await upload(new TextEncoder().encode("not a pdf"), "x.pdf", "application/pdf");
  expect(bad.status).toBe(400);
  expect((await bad.json()).error.fields).toHaveProperty("file");
  const uploaded = await upload(pdf, "licence.pdf", "application/pdf");
  expect(uploaded.status).toBe(201);
  const scan = (await uploaded.json()).data;
  expect(scan).toMatchObject({ filename: "licence.pdf" });
  const own = await call(`/api/v1/documents/${scan.id}`);
  expect(own.status).toBe(200);
  expect(own.headers.get("content-type")).toBe("application/pdf");
  expect((await call(`/api/v1/documents/${scan.id}`, { auth: other })).status).toBe(404);

  // 2. Licence, rating and medical go to the admins as pending
  const empty = (await (await call("/api/v1/me/credentials")).json()).data;
  expect(empty.summary).toMatchObject({ verified: false, missing: ["licence", "medical"] });
  const licence = await call("/api/v1/me/credentials/licences", {
    body: { type: "ppl_a", issuingState: "BG", number: "BG.FCL.123", documentId: scan.id },
  });
  expect(licence.status).toBe(201);
  const afterLicence = (await licence.json()).data;
  expect(afterLicence.licences[0]).toMatchObject({
    type: "ppl_a",
    status: "pending",
    usable: false,
    document: { id: scan.id, filename: "licence.pdf" },
  });
  expect(afterLicence.licences[0].document.url).toContain(`/api/v1/documents/${scan.id}`);
  // Someone else's document can't be attached.
  const stolen = await call("/api/v1/me/credentials/medicals", {
    auth: other,
    body: { class: "class2", issuingState: "BG", validUntil: "2030-01-01", documentId: scan.id },
  });
  expect(stolen.status).toBe(400);
  expect((await stolen.json()).error.fields).toHaveProperty("documentId");
  const wrongRating = await call("/api/v1/me/credentials/ratings", {
    body: { kind: "class", code: "JET_LAND" },
  });
  expect((await wrongRating.json()).error.fields).toHaveProperty("code");
  const rating = await call("/api/v1/me/credentials/ratings", {
    body: { kind: "privilege", code: "night", expiresOn: null },
  });
  expect((await rating.json()).data.ratings[0]).toMatchObject({ code: "NIGHT", status: "pending" });

  // 3. Changing the licence keeps it pending; experience and type hours
  const changed = await call(`/api/v1/me/credentials/licences/${afterLicence.licences[0].id}`, {
    method: "PUT",
    body: { type: "ppl_a", issuingState: "BG", number: "BG.FCL.124", documentId: scan.id },
  });
  expect((await changed.json()).data.licences[0].number).toBe("BG.FCL.124");
  const tooMany = await call("/api/v1/me/credentials/experience", {
    method: "PUT",
    body: { totalHours: 100, picHours: 150, last90DaysHours: 5 },
  });
  expect((await tooMany.json()).error.fields).toHaveProperty("picHours");
  const hours = await call("/api/v1/me/credentials/experience", {
    method: "PUT",
    body: { totalHours: 250.5, picHours: 200, last90DaysHours: 6 },
  });
  expect((await hours.json()).data.experience).toMatchObject({ totalHours: 250.5 });
  const typed = await call("/api/v1/me/credentials/type-hours/c172", {
    method: "PUT",
    body: { hours: 120 },
  });
  expect((await typed.json()).data.typeHours).toEqual([{ aircraftType: "C172", hours: 120 }]);
  const untyped = await call("/api/v1/me/credentials/type-hours/C172", { method: "DELETE" });
  expect((await untyped.json()).data.typeHours).toEqual([]);

  // 4. Deleting works only on your own items
  const licenceId = afterLicence.licences[0].id;
  const notMine = await call(`/api/v1/me/credentials/licences/${licenceId}`, {
    method: "DELETE",
    auth: other,
  });
  expect(notMine.status).toBe(404);
  const removed = await call(`/api/v1/me/credentials/licences/${licenceId}`, { method: "DELETE" });
  expect((await removed.json()).data.licences).toEqual([]);
  expect((await call(`/api/v1/documents/${scan.id}`)).status).toBe(404); // the scan went with it
  expect((await call("/api/v1/me/credentials/unknown", { body: {} })).status).toBe(404);
});
