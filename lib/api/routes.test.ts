import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Security guard (API-2, like lib/server-actions.test.ts): every /api/v1 endpoint checks the
// token (requireApiUser, or optionalApiUser where anonymous visitors may read public data; partner
// systems use their connection's API key, requireConnection) and answers through apiRoute (JSON
// errors, nothing internal leaks). Public on purpose: airports, the OpenAPI description, and the
// iCal export (the secret token in its link is the access check, SYN-3).
const PUBLIC = [
  "app/api/v1/airports/route.ts",
  "app/api/v1/airports/[ident]/route.ts",
  "app/api/v1/calendars/[file]/route.ts",
];
const DESCRIPTION = "app/api/v1/openapi.json/route.ts";

const files = execSync("find app/api/v1 -name route.ts", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => f !== DESCRIPTION);

describe("API routes", () => {
  it("found the routes", () => {
    expect(files.length).toBeGreaterThan(4);
  });

  it.each(files)("%s checks the token and answers through apiRoute", (file) => {
    const source = readFileSync(file, "utf8");
    const handlers = [...source.matchAll(/^export const (GET|POST|PUT|PATCH|DELETE) = /gm)];
    expect(handlers.length).toBeGreaterThan(0);
    for (const [line] of handlers) {
      expect(source.slice(source.indexOf(line)).startsWith(`${line}apiRoute(`)).toBe(true);
    }
    expect(source).not.toMatch(/^export (async )?function (GET|POST|PUT|PATCH|DELETE)/m);
    if (!PUBLIC.includes(file)) {
      expect(source).toMatch(/\b(requireApiUser|optionalApiUser|requireConnection)\(/);
    }
  });
});
