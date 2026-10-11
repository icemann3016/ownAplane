import { z } from "zod";

import type { ReadResult, ReadTask, ScanFile } from "./types";

// Reading driver for Anthropic's Messages API over plain fetch (no SDK, like lib/monitoring):
// the scan goes in as image or PDF blocks, the answer comes back as the input of a forced tool
// call whose schema is generated from the task's Zod schema, and is validated again here.

const SYSTEM = [
  "You read scans and photos of aviation documents (pilot licences, medical certificates,",
  "pilot logbooks) and copy what is written into the given tool, exactly as written.",
  "Never guess: use null for anything you can't read with confidence. Dates as YYYY-MM-DD.",
].join(" ");

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const base64 = (body: Uint8Array) => Buffer.from(body).toString("base64");

function fileBlock(file: ScanFile) {
  const source = { type: "base64", media_type: file.contentType, data: base64(file.body) };
  if (file.contentType === "application/pdf") return { type: "document", source };
  if (IMAGE_TYPES.has(file.contentType)) return { type: "image", source };
  throw new Error(`can't read ${file.contentType}`);
}

/** The tool's input schema: JSON Schema of the task without the meta keys. */
export function toolSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _s, ...json } = z.toJSONSchema(schema, { io: "input" }) as Record<
    string,
    unknown
  >;
  return json;
}

/** The request body (pure, for tests). */
export function buildRequest<T>(model: string, task: ReadTask<T>, files: ScanFile[]) {
  return {
    model,
    max_tokens: task.maxTokens ?? 2048,
    system: SYSTEM,
    tools: [
      { name: task.tool, description: task.description, input_schema: toolSchema(task.schema) },
    ],
    tool_choice: { type: "tool", name: task.tool },
    messages: [
      {
        role: "user",
        content: [...files.map(fileBlock), { type: "text", text: task.instructions }],
      },
    ],
  };
}

const answer = z.object({
  content: z.array(
    z.object({ type: z.string(), name: z.string().optional(), input: z.unknown().optional() }),
  ),
});

/** The tool call's input, checked against the task's schema. */
export function parseResponse<T>(json: unknown, task: ReadTask<T>): ReadResult<T> {
  const parsed = answer.safeParse(json);
  const call = parsed.success
    ? parsed.data.content.find((c) => c.type === "tool_use" && c.name === task.tool)
    : undefined;
  if (!call) return { ok: false, error: "unreadable" };
  const data = task.schema.safeParse(call.input);
  return data.success ? { ok: true, data: data.data } : { ok: false, error: "unreadable" };
}

export type AnthropicConfig = { apiKey: string; model: string; url: string };

export async function readWithAnthropic<T>(
  config: AnthropicConfig,
  task: ReadTask<T>,
  files: ScanFile[],
): Promise<ReadResult<T> & { status?: number }> {
  const res = await fetch(config.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(buildRequest(config.model, task, files)),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) return { ok: false, error: "failed", status: res.status };
  return parseResponse(await res.json(), task);
}
