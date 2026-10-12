// Why reading a link or a partner's API failed (SYN-1, SYN-7); the owner sees these, translated
// as "calendarSync.feedErrors.<code>". Anything else shows as "failed".

export const FEED_ERROR_CODES = [
  "url_invalid",
  "address_blocked",
  "unreachable",
  "http_error",
  "too_large",
  "ical_invalid",
  "json_invalid",
  "key_rejected",
  "rate_limited",
  "partner_unavailable",
] as const;
export type FeedErrorCode = (typeof FEED_ERROR_CODES)[number];

/** A stored or returned error code as a translatable one. */
export const feedErrorKey = (code: string): FeedErrorCode | "failed" =>
  (FEED_ERROR_CODES as readonly string[]).includes(code) ? (code as FeedErrorCode) : "failed";
