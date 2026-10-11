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
  it("sends pages as PDF and image blocks and asks for the tool without forcing it", () => {
    const body = buildRequest("some-model", task, [pdf, jpeg], "low");
    expect(body.model).toBe("some-model");
    // Newer models refuse tool_choice "tool" / "any" with a 400.
    expect(body.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.max_tokens).toBeGreaterThanOrEqual(8000);
    const [first, second, text] = body.messages[0]!.content as Record<string, unknown>[];
    expect(first).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
    expect(second).toMatchObject({ type: "image", source: { type: "base64", data: "/9j/" } });
    expect(text).toMatchObject({ type: "text" });
    expect(text!.text).toContain("Read the thing.");
    expect(text!.text).toContain("calling the record_thing tool");
    expect(body.tools[0]!.name).toBe("record_thing");
    expect(body.tools[0]!.input_schema).not.toHaveProperty("$schema");
    expect(toolSchema(task.schema)).toMatchObject({ type: "object" });
  });

  it("leaves effort to the model when not set", () => {
    expect(buildRequest("m", task, [jpeg])).not.toHaveProperty("output_config");
  });

  it("refuses files it can't send", () => {
    expect(() =>
      buildRequest("m", task, [{ contentType: "text/plain", body: new Uint8Array() }]),
    ).toThrow();
  });

  it("takes the tool call's input when it fits the schema, after any thinking", () => {
    const answer = (input: unknown) => ({
      stop_reason: "tool_use",
      content: [
        { type: "thinking", thinking: "", signature: "x" },
        { type: "text", text: "Here." },
        { type: "tool_use", id: "t1", name: "record_thing", input },
      ],
    });
    expect(parseResponse(answer({ name: "A", date: "2027-01-31" }), task)).toEqual({
      ok: true,
      data: { name: "A", date: "2027-01-31" },
    });
    const wrong = parseResponse(answer({ name: 3, date: null }), task);
    expect(wrong).toMatchObject({ ok: false, error: "unreadable" });
    expect(!wrong.ok && wrong.detail).toMatch(/^answer didn't fit \(stop_reason tool_use\): name:/);
  });

  it("takes an answer written as JSON text instead of a tool call", () => {
    const text = 'Here it is:\n```json\n{"name": "B", "date": null}\n```';
    expect(
      parseResponse({ stop_reason: "end_turn", content: [{ type: "text", text }] }, task),
    ).toEqual({ ok: true, data: { name: "B", date: null } });
  });

  it("says why there is no answer", () => {
    const sorry = { stop_reason: "max_tokens", content: [{ type: "text", text: "Sorry" }] };
    expect(parseResponse(sorry, task)).toEqual({
      ok: false,
      error: "unreadable",
      detail: "no answer (stop_reason max_tokens)",
    });
    expect(parseResponse("nonsense", task)).toMatchObject({ ok: false, error: "unreadable" });
  });
});
