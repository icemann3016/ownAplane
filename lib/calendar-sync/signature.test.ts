import { describe, expect, it } from "vitest";

import { newWebhookSecret, signWebhook, verifyWebhook } from "./signature";

describe("webhook signatures", () => {
  const secret = "a".repeat(64);
  const body = JSON.stringify({ type: "ping" });

  it("signs the timestamp and body so receivers can check both", () => {
    const header = signWebhook(secret, body, 1_800_000_000);
    expect(header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(verifyWebhook(secret, body, header, 1_800_000_010)).toBe(true);
  });

  it("refuses another body, another secret or an old signature", () => {
    const header = signWebhook(secret, body, 1_800_000_000);
    expect(verifyWebhook(secret, `${body} `, header, 1_800_000_000)).toBe(false);
    expect(verifyWebhook("b".repeat(64), body, header, 1_800_000_000)).toBe(false);
    expect(verifyWebhook(secret, body, header, 1_800_001_000)).toBe(false);
    expect(verifyWebhook(secret, body, "t=x,v1=00", 1_800_000_000)).toBe(false);
  });

  it("makes 64-character hex secrets", () => {
    expect(newWebhookSecret()).toMatch(/^[0-9a-f]{64}$/);
    expect(newWebhookSecret()).not.toBe(newWebhookSecret());
  });
});
