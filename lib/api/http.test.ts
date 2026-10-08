import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn(async () => false) }));

import { ApiError, apiRoute, parse, queryOf } from "./http";

const call = (handler: () => Promise<Response>) =>
  apiRoute(handler)(new Request("https://x.test/api/v1/thing?a=1&a=2&b="), {});

describe("API conventions", () => {
  it("answers ApiErrors with their status and JSON body", async () => {
    const res = await call(async () => {
      throw new ApiError("not_found", "No such thing.");
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "No such thing." } });
  });

  it("asks for a Bearer token on 401", async () => {
    const res = await call(async () => {
      throw new ApiError("unauthorized", "Sign in.");
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const res = await call(async () => {
      throw new Error("connection string postgres://secret");
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("reports invalid input per field", () => {
    const schema = z.object({ q: z.string().min(2) });
    try {
      parse(schema, { q: "x" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe("validation_failed");
      expect((e as ApiError).fields?.q?.length).toBe(1);
    }
  });

  it("reads the first value of each query parameter and drops empty ones", () => {
    expect(queryOf(new Request("https://x.test/?a=1&a=2&b="))).toEqual({ a: "1" });
  });
});
