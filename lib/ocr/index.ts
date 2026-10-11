import "server-only";

import { reportError } from "@/lib/monitoring";
import { readWithAnthropic } from "./anthropic";
import type { ReadResult, ReadTask, ScanFile } from "./types";

export type { ReadError, ReadResult, ReadTask, ScanFile } from "./types";

// Reading scans with a vision AI model (VER-9, LOG-6). One driver today (Anthropic's Messages
// API); the rest of the app only sees readScan(). Off until ANTHROPIC_API_KEY and OCR_MODEL are
// set; OCR_API_URL points tests at a local stand-in.

function config() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.OCR_MODEL?.trim();
  if (!apiKey || !model) return null;
  const url = process.env.OCR_API_URL?.trim() || "https://api.anthropic.com/v1/messages";
  return { apiKey, model, url };
}

export function isOcrConfigured(): boolean {
  return config() !== null;
}

/** Read one or more pages into the task's schema. Never throws for provider trouble. */
export async function readScan<T>(task: ReadTask<T>, files: ScanFile[]): Promise<ReadResult<T>> {
  const settings = config();
  if (!settings) return { ok: false, error: "not_configured" };
  try {
    const result = await readWithAnthropic(settings, task, files);
    if (!result.ok && result.error === "failed") {
      await reportError(new Error(`document reading failed (${result.status ?? "?"})`), {
        where: "ocr",
        tags: { tool: task.tool },
      });
    }
    return result;
  } catch (e) {
    await reportError(e, { where: "ocr", tags: { tool: task.tool } });
    return { ok: false, error: "failed" };
  }
}
