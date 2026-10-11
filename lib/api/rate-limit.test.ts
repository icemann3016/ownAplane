import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { callerOf, LIMITS } from "./rate-limit";

const hash32 = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 32);
const req = (headers: Record<string, string>) =>
  new Request("https://ownaplane.eu/api/v1/me", { headers });

describe("callerOf (API-6)", () => {
  it("counts app tokens per session, whatever the signature", () => {
    const a = callerOf(req({ authorization: "Bearer abc123.sig1", "x-forwarded-for": "1.2.3.4" }));
    const b = callerOf(req({ authorization: "bearer abc123.other" }));
    expect(a).toEqual({
      key: `tok:${hash32("abc123")}`,
      limit: LIMITS.user,
      badKey: "bad:1.2.3.4",
    });
    expect(b.key).toBe(a.key);
  });

  it("gives partner keys their own, higher limit, keyed like the stored key hash", () => {
    const key = "oap_secret";
    const caller = callerOf(req({ authorization: `Bearer ${key}` }));
    const stored = createHash("sha256").update(key).digest("hex");
    expect(caller).toMatchObject({ key: `key:${stored.slice(0, 32)}`, limit: LIMITS.partner });
  });

  it("counts calls without a token per address", () => {
    expect(callerOf(req({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toEqual({
      key: "ip:9.9.9.9",
      limit: LIMITS.anonymous,
      badKey: "bad:9.9.9.9",
    });
    expect(callerOf(req({ "x-real-ip": "8.8.8.8" })).key).toBe("ip:8.8.8.8");
    expect(callerOf(req({})).key).toBe("ip:unknown");
  });
});
