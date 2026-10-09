import { z } from "zod";

// Connecting an aircraft to another booking system (SYN-1, SYN-4). Messages are keys in
// messages/*.json → "validation".

export const CONNECTION_KINDS = ["push", "ical", "json", "none"] as const;

/** Calendar apps often hand out webcal:// links; they are https underneath. */
const normalizeLink = (v: string) => v.trim().replace(/^webcals?:\/\//i, "https://");

export const connectionSchema = z
  .object({
    aircraftId: z.uuid(),
    name: z.string().trim().min(1, "connectionNameRequired").max(80, "textTooLong"),
    inbound: z.enum(CONNECTION_KINDS),
    feedUrl: z.string().optional().default("").transform(normalizeLink),
  })
  .superRefine((d, ctx) => {
    if (d.inbound !== "ical" && d.inbound !== "json") return;
    let ok = false;
    try {
      ok = new URL(d.feedUrl).protocol === "https:" && d.feedUrl.length <= 2000;
    } catch {
      ok = false;
    }
    if (!ok) ctx.addIssue({ code: "custom", path: ["feedUrl"], message: "feedUrlInvalid" });
  })
  .transform((d) => ({
    ...d,
    feedUrl: d.inbound === "ical" || d.inbound === "json" ? d.feedUrl : null,
  }));
