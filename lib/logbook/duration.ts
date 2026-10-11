// Flight times as pilots write them (LOG-1): "1:25" (hours:minutes, the logbook way) or "1.4"
// (decimal hours). Stored as whole minutes.

/** "1:25" → 85, "1.4" / "1,4" → 84, "" → null; anything else → NaN. */
export function parseDuration(input: string): number | null {
  const v = input.trim();
  if (v === "") return null;
  const hm = /^(\d{1,5}):([0-5]\d)$/.exec(v);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const dec = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(v);
  if (dec) return Math.round(Number(`${dec[1]}.${dec[2] ?? "0"}`) * 60);
  return Number.NaN;
}

/** 85 → "1:25", 0 → "0:00", null → "". */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return "";
  const h = Math.floor(minutes / 60);
  return `${h}:${String(minutes % 60).padStart(2, "0")}`;
}
