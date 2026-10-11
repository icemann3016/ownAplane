import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { apiSignIn, signUp, unique, userId, withDb } from "./helpers";

// An owner lists an aircraft through the API (API-3, LST-1…8): draft, details, photos,
// documents, requirements, listing, and the checks that keep a listing valid.
test.skip(!process.env.E2E_FULL, "set E2E_FULL=1 to run against a throwaway database");

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name));

test("an owner lists an aircraft through the API", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const id = unique();
  const letters = id
    .replace(/[^a-z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  const ownerEmail = `api-own-${id}@example.com`;
  const pilotEmail = `api-own-pilot-${id}@example.com`;
  for (const [name, email] of [
    [`Owner ${id}`, ownerEmail],
    [`Pilot ${id}`, pilotEmail],
  ] as const) {
    const context = await browser.newContext();
    await signUp(await context.newPage(), name, email);
    await context.close();
  }
  await withDb(async (sql) => {
    const owner = await userId(sql, ownerEmail);
    await sql`insert into user_roles (user_id, role) values (${owner}, 'owner') on conflict do nothing`;
  });
  const owner = `Bearer ${await apiSignIn(baseURL, ownerEmail)}`;
  const pilot = `Bearer ${await apiSignIn(baseURL, pilotEmail)}`;
  const call = (route: string, init: { method?: string; body?: unknown; auth?: string } = {}) =>
    fetch(new URL(route, baseURL), {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        authorization: init.auth ?? owner,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  const upload = (route: string, file: Buffer, name: string, type: string) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file)], { type }), name);
    return fetch(new URL(route, baseURL), {
      method: "POST",
      headers: { authorization: owner },
      body: form,
    });
  };

  // 1. Only owners add aircraft; a draft says what it still needs
  const details = {
    registration: `lz-m${letters.toLowerCase()}`,
    manufacturer: "Cessna",
    model: "172S",
    typeDesignator: "c172",
    seats: 4,
    fuelType: "avgas_100ll",
    fuelBurnLph: 32,
  };
  expect((await call("/api/v1/me/aircraft", { body: details, auth: pilot })).status).toBe(403);
  const created = await call("/api/v1/me/aircraft", { body: details });
  expect(created.status).toBe(201);
  const draft = (await created.json()).data;
  expect(draft).toMatchObject({
    registration: `LZ-M${letters}`,
    typeDesignator: "C172",
    status: "draft",
    fuelBurnLph: 32,
    gaps: ["home_base", "price", "photo", "arc", "insurance"],
  });
  const plane = `/api/v1/me/aircraft/${draft.id}`;
  expect((await call(plane, { auth: pilot })).status).toBe(404);

  // 2. Base and price; an unknown airfield is refused
  const unknown = await call(plane, { method: "PATCH", body: { homeAirport: "ZZZZ" } });
  expect((await unknown.json()).error.fields).toHaveProperty("homeAirport");
  const priced = await call(plane, {
    method: "PATCH",
    body: { homeAirport: "lbsf", pricePerHour: 180.555, priceBasis: "wet", nightVfr: true },
  });
  expect((await priced.json()).data).toMatchObject({
    homeAirport: "LBSF",
    pricePerHour: 180.56,
    nightVfr: true,
    gaps: ["photo", "arc", "insurance"],
  });

  // 3. Photos: add two, put the second first, remove one
  const photo = fixture("aircraft.jpg");
  expect((await upload(`${plane}/photos`, photo, "a.jpg", "image/jpeg")).status).toBe(201);
  const second = (await (await upload(`${plane}/photos`, photo, "b.jpg", "image/jpeg")).json()).data
    .photos as { id: string }[];
  expect(second).toHaveLength(2);
  const reordered = await call(`${plane}/photos/order`, {
    method: "PUT",
    body: { order: [second[1]!.id, second[0]!.id] },
  });
  expect((await reordered.json()).data.photos[0].id).toBe(second[1]!.id);
  const one = await call(`${plane}/photos/${second[0]!.id}`, { method: "DELETE" });
  expect((await one.json()).data.photos).toHaveLength(1);
  const pdfUpload = await upload(`${plane}/photos`, fixture("licence.pdf"), "x.pdf", "image/jpeg");
  expect(pdfUpload.status).toBe(400);

  // 4. ARC and insurance wait for an admin; until then the aircraft can't be listed
  const file = (
    await (
      await upload("/api/v1/documents", fixture("licence.pdf"), "arc.pdf", "application/pdf")
    ).json()
  ).data;
  const noExpiry = await call(`${plane}/documents`, {
    body: { kind: "insurance", documentId: file.id },
  });
  expect((await noExpiry.json()).error.fields).toHaveProperty("expiresOn");
  for (const kind of ["arc", "insurance"]) {
    const added = await call(`${plane}/documents`, {
      body: { kind, expiresOn: "2030-06-30", documentId: file.id },
    });
    expect(added.status).toBe(201);
  }
  const notReady = await call(`${plane}/status`, { method: "PUT", body: { status: "listed" } });
  expect(notReady.status).toBe(409);
  expect((await notReady.json()).error.details).toMatchObject({
    reason: "not_ready",
    missing: ["arc", "insurance"],
  });
  await withDb(
    (sql) => sql`update aircraft_documents set status = 'verified'
      where aircraft_id = ${draft.id} and kind in ('arc', 'insurance')`,
  );

  // 5. Requirements, then listed and public
  const required = await call(`${plane}/requirements`, {
    method: "PUT",
    body: { licenceTypes: ["ppl_a"], requiredRatings: ["night"], minTotalHours: 100 },
  });
  expect((await required.json()).data.requirements).toMatchObject({
    licenceTypes: ["ppl_a"],
    requiredRatings: ["NIGHT"],
    minTotalHours: 100,
    allowUnrated: true,
  });
  const listed = await call(`${plane}/status`, { method: "PUT", body: { status: "listed" } });
  expect((await listed.json()).data).toMatchObject({ status: "listed", gaps: [] });
  expect((await fetch(new URL(`/api/v1/aircraft/${draft.id}`, baseURL))).status).toBe(200);
  const mine = (await (await call("/api/v1/me/aircraft")).json()).data;
  expect(mine.find((a: { id: string }) => a.id === draft.id)).toMatchObject({ status: "listed" });

  // 6. A listed aircraft keeps its last photo and its valid ARC
  const [only] = (await (await call(plane)).json()).data.photos;
  const lastPhoto = await call(`${plane}/photos/${only.id}`, { method: "DELETE" });
  expect((await lastPhoto.json()).error.details.reason).toBe("last_photo");
  const docs = (await (await call(plane)).json()).data.documents as { id: string; kind: string }[];
  const arc = docs.find((d) => d.kind === "arc")!;
  const removeArc = await call(`${plane}/documents/${arc.id}`, { method: "DELETE" });
  expect((await removeArc.json()).error.details.reason).toBe("cant_delete_listed");
  const changeKind = await call(`${plane}/documents/${arc.id}`, {
    method: "PUT",
    body: { kind: "insurance", expiresOn: "2031-01-01", documentId: file.id },
  });
  expect((await changeKind.json()).error.fields).toHaveProperty("kind");

  // 7. Unlist and delete
  const unlisted = await call(`${plane}/status`, { method: "PUT", body: { status: "unlisted" } });
  expect((await unlisted.json()).data.status).toBe("unlisted");
  expect((await call(plane, { method: "DELETE" })).status).toBe(200);
  expect((await call(plane)).status).toBe(404);
});
