// How another system's busy times are stored, given what the owner chose to take from it
// (IMPORT_FIELDS, SYN-1/SYN-4). Pure.
import { type ExternalEvent, sameRegistration } from "./events";
import type { ImportField } from "./fields";

export type Incoming = {
  event: ExternalEvent;
  /** "maintenance" only when the owner takes the type. */
  kind: "unavailable" | "maintenance";
  /** The title, only when the owner takes it (shown to the owner only). */
  note: string | null;
};

/** ignored = tentative and the owner takes the status; wrong_aircraft = another registration. */
export type Skipped = "ignored" | "wrong_aircraft";

export function prepareIncoming(
  events: ExternalEvent[],
  fields: readonly ImportField[],
  registration: string,
): { keep: Incoming[]; skipped: Map<string, Skipped> } {
  const keep: Incoming[] = [];
  const skipped = new Map<string, Skipped>();
  for (const event of events) {
    if (
      fields.includes("registration") &&
      event.registration &&
      !sameRegistration(event.registration, registration)
    ) {
      skipped.set(event.id, "wrong_aircraft");
      continue;
    }
    if (fields.includes("status") && event.tentative) {
      skipped.set(event.id, "ignored");
      continue;
    }
    keep.push({
      event,
      kind: fields.includes("type") && event.type === "maintenance" ? "maintenance" : "unavailable",
      note: fields.includes("title") ? (event.title ?? null) : null,
    });
  }
  return { keep, skipped };
}
