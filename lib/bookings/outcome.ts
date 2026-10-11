import "server-only";

import type { LegTimeIssue } from "@/lib/domain/leg-times";

// Outcomes of operations shared by the website's forms and the API: ok, or a stable error code
// (and a field) the caller turns into its own message or HTTP error.

export type Fail = {
  ok: false;
  error: string;
  field?: string;
  issues?: LegTimeIssue[];
  /** What is still missing, e.g. listing gaps. */
  missing?: string[];
  /** The plan's limit that was reached (SUB-3). */
  limit?: number;
};
export type Done<T = object> = ({ ok: true } & T) | Fail;

/** Database refusals as outcomes: raised codes, RLS (not editable), checks, missing rows. */
export function refusal(e: unknown): Fail {
  const err = e as { cause?: { code?: string; message?: string } };
  const code = err.cause?.code;
  const message = err.cause?.message;
  if (code === "P0001" && message) return { ok: false, error: message };
  if (code === "42501") return { ok: false, error: "not_editable" };
  if (code === "23514") return { ok: false, error: "checks_failed" };
  if (code === "23503") return { ok: false, error: "not_found" };
  throw e;
}
