import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildRequest, parseResponse, toolSchema } from "./anthropic";

const task = {
  tool: "record_thing",
  description: "Record it.",
  instructions: "Read the thing.",
  schema: z.object({ name: z.string().nullable(), date: z.iso.date().nullable() }),
};
const pdf = { contentType: "application/pdf", body: new Uint8Array([37, 80, 68, 70]) };
const jpeg = { contentType: "image/jpeg", body: new Uint8Array([255, 216, 255]) };

describe("Anthropic reading driver", () => {
  it("sends pages as PDF and image blocks and forces the tool", () => {
    const body = buildRequest("some-model", task, [pdf, jpeg]);
    expect(body.model).toBe("some-model");
    expect(body.tool_choice).toEqual({ type: "tool", name: "record_thing" });
    const [first, second, text] = body.messages[0]!.content as Record<string, unknown>[];
    expect(first).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
    expect(second).toMatchObject({ type: "image", source: { type: "base64", data: "/9j/" } });
    expect(text).toEqual({ type: "text", text: "Read the thing." });
    expect(body.tools[0]!.input_schema).not.toHaveProperty("$schema");
    expect(toolSchema(task.schema)).toMatchObject({ type: "object" });
  });

  it("refuses files it can't send", () => {
    expect(() =>
      buildRequest("m", task, [{ contentType: "text/plain", body: new Uint8Array() }]),
    ).toThrow();
  });

  it("takes the tool call's input when it fits the schema", () => {
    const answer = (input: unknown) => ({
      content: [
        { type: "text", text: "Here." },
        { type: "tool_use", name: "record_thing", input },
      ],
    });
    expect(parseResponse(answer({ name: "A", date: "2027-01-31" }), task)).toEqual({
      ok: true,
      data: { name: "A", date: "2027-01-31" },
    });
    expect(parseResponse(answer({ name: 3, date: null }), task)).toEqual({
      ok: false,
      error: "unreadable",
    });
    expect(parseResponse({ content: [{ type: "text", text: "Sorry" }] }, task).ok).toBe(false);
    expect(parseResponse("nonsense", task).ok).toBe(false);
  });
});
