// What a connection exchanges with the other system besides the times (SYN-3, SYN-4). The owner
// picks per connection (Aircraft → Calendar sync); nothing extra by default (data minimisation).
// Pure: used by the form, the exports and the import.

/** Sent to the other system (iCal link and GET /api/v1/sync/busy). */
export const EXPORT_FIELDS = [
  "type",
  "status",
  "route",
  "pilot",
  "reference",
  "note",
  "registration",
] as const;
export type ExportField = (typeof EXPORT_FIELDS)[number];

/** Taken from the other system (push API, JSON and iCal links). */
export const IMPORT_FIELDS = ["title", "type", "status", "registration"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

const pick =
  <T extends string>(all: readonly T[]) =>
  (values: readonly string[] | null | undefined): T[] =>
    all.filter((f) => values?.includes(f));

/** Known fields only, in catalog order (unknown values are dropped). */
export const exportFields = pick(EXPORT_FIELDS);
export const importFields = pick(IMPORT_FIELDS);

/** Personal data among the export fields: the form warns before it is shared. */
export const PERSONAL_EXPORT_FIELDS: readonly ExportField[] = ["pilot"];
