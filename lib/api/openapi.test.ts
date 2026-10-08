import { describe, expect, it } from "vitest";

import { openApiDocument } from "./openapi";

describe("OpenAPI description", () => {
  const doc = openApiDocument();

  it("describes every endpoint and the token sign-in", () => {
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/api/auth/sign-in/email",
        "/api/v1/me",
        "/api/v1/airports",
        "/api/v1/aircraft",
        "/api/v1/aircraft/{id}",
        "/api/v1/bookings",
        "/api/v1/bookings/{id}",
      ]),
    );
    expect(doc.components.securitySchemes.bearer.scheme).toBe("bearer");
  });

  it("only refers to schemas it defines", () => {
    const refs = [...JSON.stringify(doc).matchAll(/#\/components\/schemas\/(\w+)/g)].map(
      (m) => m[1]!,
    );
    for (const name of new Set(refs)) expect(doc.components.schemas).toHaveProperty(name);
  });

  it("takes query parameters from the input schemas", () => {
    const params = doc.paths["/api/v1/aircraft"].get.parameters.map((p) => p.name);
    expect(params).toEqual(expect.arrayContaining(["airport", "radius", "from", "to", "eligible"]));
    const q = doc.paths["/api/v1/airports"].get.parameters.find((p) => p.name === "q");
    expect(q?.required).toBe(true);
  });
});
