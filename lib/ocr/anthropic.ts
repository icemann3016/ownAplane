import { z } from "zod";

import type { ReadResult, ReadTask, ScanFile } from "./types";

// Reading driver for Anthropic's Messages API over plain fetch (no SDK, like lib/monitoring):
// the scan goes in as image or PDF blocks and the model answers by calling the task's tool, whose
// schema is generated from the task's Zod schema. Newer models refuse a forced tool call, so the
// call is asked for in the prompt (tool_choice auto, at most one call) and an answer written as
// JSON text is taken too; either way it is validated again here. Effort "low" by default keeps
// reading quick (the page has a minute); OCR_EFFORT changes it.

const SYSTEM = [
  "You read scans and photos of aviation documents (pilot licences, medical certificates,",
  "pilot logbooks) and copy what is written into the given tool, exactly as written.",
  "Never guess: use null for anything you can't read with confidence. Dates as YYYY-MM-DD.",
].join(" ");

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

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
export function buildRequest<T>(
  model: string,
  task: ReadTask<T>,
  files: ScanFile[],
  effort?: Effort,
) {
  return {
    model,
    // Room for the model's thinking before the answer.
    max_tokens: task.maxTokens ?? 8000,
    system: SYSTEM,
    tools: [
      { name: task.tool, description: task.description, input_schema: toolSchema(task.schema) },
    ],
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    ...(effort ? { output_config: { effort } } : {}),
    messages: [
      {
        role: "user",
        content: [
          ...files.map(fileBlock),
          {
            type: "text",
            text: `${task.instructions}\n\nAnswer by calling the ${task.tool} tool once.`,
          },
        ],
      },
    ],
  };
}

const answer = z.object({
  stop_reason: z.string().nullish(),
  content: z.array(
    z.object({
      type: z.string(),
      name: z.string().optional(),
      input: z.unknown().optional(),
      text: z.string().optional(),
    }),
  ),
});

type Block = z.infer<typeof answer>["content"][number];

/** A JSON object written as text instead of a tool call, if there is one. */
function jsonInText(content: Block[]): unknown {
  const text = content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
  const [start, end] = [text.indexOf("{"), text.lastIndexOf("}")];
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

export type DriverResult<T> = ReadResult<T> & { detail?: string };

/**
 * The answer, checked against the task's schema. `detail` says why there is none (stop reason,
 * which fields didn't fit; never what was read), for error reports.
 */
export function parseResponse<T>(json: unknown, task: ReadTask<T>): DriverResult<T> {
  const parsed = answer.safeParse(json);
  if (!parsed.success) return { ok: false, error: "unreadable", detail: "unexpected response" };
  const { content, stop_reason: stop } = parsed.data;
  const call = content.find((c) => c.type === "tool_use" && c.name === task.tool);
  const candidate = call ? call.input : jsonInText(content);
  if (candidate === undefined) {
    return { ok: false, error: "unreadable", detail: `no answer (stop_reason ${stop ?? "?"})` };
  }
  const data = task.schema.safeParse(candidate);
  if (data.success) return { ok: true, data: data.data };
  const issues = data.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "answer"}: ${i.message}`)
    .join("; ");
  return {
    ok: false,
    error: "unreadable",
    detail: `answer didn't fit (stop_reason ${stop ?? "?"}): ${issues}`,
  };
}

/** Why the API refused, from its error body (type and message only). */
async function apiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { type?: string; message?: string };
  } | null;
  return `${res.status} ${body?.error?.type ?? ""}: ${body?.error?.message ?? ""}`.slice(0, 500);
}

export type AnthropicConfig = { apiKey: string; model: string; url: string; effort?: Effort };

export async function readWithAnthropic<T>(
  config: AnthropicConfig,
  task: ReadTask<T>,
  files: ScanFile[],
): Promise<DriverResult<T>> {
  const res = await fetch(config.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(buildRequest(config.model, task, files, config.effort)),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) return { ok: false, error: "failed", detail: await apiError(res) };
  return parseResponse(await res.json(), task);
}
