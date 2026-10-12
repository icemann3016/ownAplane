import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./secrets";

describe("stored secrets", () => {
  const before = process.env.BETTER_AUTH_SECRET;
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-stored-secrets-0123456789";
  });
  afterEach(() => {
    process.env.BETTER_AUTH_SECRET = before;
  });

  it("encrypts so the value isn't readable, and decrypts it again", () => {
    const stored = encryptSecret("raf-key-1234", "user-1:rafaviation");
    expect(stored).toMatch(/^v1\./);
    expect(stored).not.toContain("raf-key");
    expect(encryptSecret("raf-key-1234", "user-1:rafaviation")).not.toBe(stored); // fresh IV
    expect(decryptSecret(stored, "user-1:rafaviation")).toBe("raf-key-1234");
  });

  it("refuses another row's value, a changed value and another server secret", () => {
    const stored = encryptSecret("raf-key-1234", "user-1:rafaviation");
    expect(decryptSecret(stored, "user-2:rafaviation")).toBeNull();
    const flipped = stored.slice(0, -2) + (stored.endsWith("A") ? "B" : "A") + stored.slice(-1);
    expect(decryptSecret(flipped, "user-1:rafaviation")).toBeNull();
    expect(decryptSecret("v0.abc", "user-1:rafaviation")).toBeNull();
    process.env.BETTER_AUTH_SECRET = "another-secret-entirely-9876543210";
    expect(decryptSecret(stored, "user-1:rafaviation")).toBeNull();
  });
});
