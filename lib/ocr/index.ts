import "server-only";

import { reportError } from "@/lib/monitoring";
import { EFFORTS, type Effort, readWithAnthropic } from "./anthropic";
import type { ReadResult, ReadTask, ScanFile } from "./types";

export type { ReadError, ReadResult, ReadTask, ScanFile } from "./types";

// Reading scans with a vision AI model (VER-9, LOG-6). One driver today (Anthropic's Messages
// API); the rest of the app only sees readScan(). Off until ANTHROPIC_API_KEY and OCR_MODEL are
// set; OCR_EFFORT (default low; "off" leaves the model's own default) trades speed for care;
// OCR_API_URL points tests at a local stand-in.

function config() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.OCR_MODEL?.trim();
  if (!apiKey || !model) return null;
  const url = process.env.OCR_API_URL?.trim() || "https://api.anthropic.com/v1/messages";
  const wanted = process.env.OCR_EFFORT?.trim().toLowerCase() || "low";
  const effort = EFFORTS.find((e): e is Effort => e === wanted);
  return { apiKey, model, url, effort };
}

export function isOcrConfigured(): boolean {
  return config() !== null;
}

/** Read one or more pages into the task's schema. Never throws for provider trouble. */
export async function readScan<T>(task: ReadTask<T>, files: ScanFile[]): Promise<ReadResult<T>> {
  const settings = config();
  if (!settings) return { ok: false, error: "not_configured" };
  try {
    const { detail, ...result } = await readWithAnthropic(settings, task, files);
    if (!result.ok) {
      // What went wrong (API error or why the answer didn't fit), never what was read.
      const what = result.error === "failed" ? "refused" : "gave no usable answer";
      await reportError(new Error(`document reading ${what}: ${detail ?? "?"}`), {
        where: "ocr",
        tags: { tool: task.tool, model: settings.model },
      });
    }
    return result;
  } catch (e) {
    await reportError(e, { where: "ocr", tags: { tool: task.tool } });
    return { ok: false, error: "failed" };
  }
}
