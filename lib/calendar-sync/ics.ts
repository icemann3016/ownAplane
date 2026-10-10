// Our busy times as an iCal feed (SYN-3), for other systems to subscribe to. Only what the
// owner chose to share (outgoing.ts builds the events). Pure.

export type IcsEvent = {
  id: string;
  from: Date;
  to: Date;
  summary: string;
  description?: string;
  location?: string;
  status?: "TENTATIVE" | "CONFIRMED";
  url?: string;
};

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Escape text values (RFC 5545 §3.3.11). */
const text = (v: string) => v.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(opts: {
  name: string;
  host: string;
  events: IcsEvent[];
  now?: Date;
}): string {
  const now = stamp(opts.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ownAplane//Calendar sync//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(opts.name)}`,
    "X-PUBLISHED-TTL:PT15M",
    ...opts.events.flatMap((e) => [
      "BEGIN:VEVENT",
      `UID:${e.id}@${opts.host}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.from)}`,
      `DTEND:${stamp(e.to)}`,
      `SUMMARY:${text(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${text(e.description)}`] : []),
      ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
      ...(e.status ? [`STATUS:${e.status}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      "TRANSP:OPAQUE",
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
