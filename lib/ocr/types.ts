import type { z } from "zod";

// What the reading drivers take and give back (lib/ocr).

/** One page: an image (JPEG, PNG, WebP) or a PDF. */
export type ScanFile = { contentType: string; body: Uint8Array };

/** What to read: the answer must match `schema`, given as the input of the task's tool. */
export type ReadTask<T> = {
  /** Tool name, e.g. record_licence. */
  tool: string;
  description: string;
  /** What to look for and how to answer. */
  instructions: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
};

export type ReadError = "not_configured" | "unreadable" | "failed";
export type ReadResult<T> = { ok: true; data: T } | { ok: false; error: ReadError };
