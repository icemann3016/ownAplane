import "server-only";

import { z } from "zod";

import { formatUtc } from "@/lib/aircraft/format";
import { avatarUrl } from "@/lib/avatar-url";
import { localeOf, translatorFor } from "@/lib/i18n/catalogs";
import type { ConversationSummary, openConversation } from "@/lib/messages";
import { knownType, type listNotifications } from "@/lib/notifications";
import type { Favourite } from "@/lib/saved/favourites";
import type { SavedSearch } from "@/lib/db/schema";
import { parseQuery } from "@/lib/validation/search";
import { absoluteUrl } from "./dto";

// Messages, notifications, favourites and saved searches in the API (MSG-1, BKG-9, SRC-6):
// inputs, response shapes and DTOs of this area (the rest is in schemas/responses/dto.ts).

const time = z.iso.datetime().describe("ISO 8601, UTC");
const id = z.uuid();
const person = z.object({ id, displayName: z.string(), avatarUrl: z.url().nullable() }).nullable();
const aircraftRef = z.object({
  id,
  registration: z.string(),
  manufacturer: z.string(),
  model: z.string(),
});

// --- Inputs ---

export const startConversationBody = z.object({
  aircraftId: z.uuid(),
  bookingId: z.uuid().nullable().default(null).describe("null = an enquiry about the listing"),
  body: z.string().trim().min(1).max(2000).nullable().default(null).describe("First message"),
});

export const messageBody = z.object({ body: z.string().trim().min(1).max(2000) });

export const savedSearchBody = z.object({
  name: z.string().trim().min(1).max(80),
  query: z
    .string()
    .max(1000)
    .default("")
    .describe("The search as a query string, e.g. airport=LBSF&radius=50&from=2026-10-20T08:00"),
  alerts: z.boolean().default(true),
});

export const savedSearchPatch = z.object({ alerts: z.boolean() });

// --- Responses ---

export const conversationSummary = z.object({
  id,
  bookingId: id.nullable(),
  role: z.enum(["owner", "pilot"]),
  other: person,
  aircraft: aircraftRef,
  lastMessageAt: time,
  lastMessage: z.string().nullable(),
  unread: z.boolean(),
});

export const conversation = conversationSummary
  .omit({ lastMessage: true, lastMessageAt: true, unread: true })
  .extend({
    booking: z.object({ status: z.string(), from: time }).nullable(),
    canWrite: z.boolean(),
    messages: z.array(z.object({ id, mine: z.boolean(), body: z.string(), createdAt: time })),
  });

export const notification = z.object({
  id,
  type: z.string().describe("requested, accepted, … saved_search"),
  text: z.string().describe("In the user's language"),
  bookingId: id.nullable(),
  savedSearchId: id.nullable(),
  createdAt: time,
  read: z.boolean(),
});

export const favourite = z.object({
  aircraft: aircraftRef.extend({
    status: z.string(),
    airportCode: z.string().nullable(),
    pricePerHour: z.number().nullable(),
    currency: z.string(),
    coverUrl: z.url().nullable(),
  }),
  savedAt: time,
});

export const savedSearch = z.object({
  id,
  name: z.string(),
  query: z.string(),
  filters: z.record(z.string(), z.unknown()).describe("The query read as filters"),
  alerts: z.boolean(),
  lastAlertAt: time.nullable(),
  createdAt: time,
});

// --- DTOs ---

const iso = (d: Date) => d.toISOString();
const personDto = (p: { id: string; name: string; avatarKey: string | null } | null) =>
  p ? { id: p.id, displayName: p.name, avatarUrl: absoluteUrl(avatarUrl(p.avatarKey)) } : null;

export function conversationSummaryDto(
  c: ConversationSummary,
): z.infer<typeof conversationSummary> {
  return {
    id: c.id,
    bookingId: c.bookingId,
    role: c.isOwner ? "owner" : "pilot",
    other: personDto(c.other),
    aircraft: c.aircraft,
    lastMessageAt: iso(c.lastMessageAt),
    lastMessage: c.lastMessage,
    unread: c.unread,
  };
}

export function conversationDto(
  c: NonNullable<Awaited<ReturnType<typeof openConversation>>>,
  userId: string,
): z.infer<typeof conversation> {
  return {
    id: c.id,
    bookingId: c.bookingId,
    role: c.isOwner ? "owner" : "pilot",
    other: personDto(c.other),
    aircraft: c.aircraft,
    booking: c.booking ? { status: c.booking.status, from: iso(c.booking.from) } : null,
    canWrite: c.canWrite,
    messages: c.messages.map((m) => ({
      id: m.id,
      mine: m.senderId === userId,
      body: m.body,
      createdAt: iso(m.createdAt),
    })),
  };
}

type NotificationRow = Awaited<ReturnType<typeof listNotifications>>[number];

/** Notifications with their sentence in the user's language (as on /notifications). */
export function notificationDtos(
  rows: NotificationRow[],
  locale: string | null | undefined,
): z.infer<typeof notification>[] {
  const t = translatorFor(locale, "notifications");
  const l = localeOf(locale);
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    text: t(`types.${knownType(n.type)}`, {
      registration: n.booking?.registration ?? "",
      when: n.booking ? formatUtc(n.booking.from, l) : "",
      other: n.actor ?? t("someone"),
      search: n.search?.name ?? "",
    }),
    bookingId: n.bookingId,
    savedSearchId: n.savedSearchId,
    createdAt: iso(n.createdAt),
    read: n.readAt !== null,
  }));
}

export function favouriteDto(f: Favourite): z.infer<typeof favourite> {
  return {
    aircraft: {
      id: f.id,
      registration: f.registration,
      manufacturer: f.manufacturer,
      model: f.model,
      status: f.status,
      airportCode: f.airportCode,
      pricePerHour: f.pricePerHour,
      currency: f.currency,
      coverUrl: absoluteUrl(f.coverUrl),
    },
    savedAt: iso(f.savedAt),
  };
}

export function savedSearchDto(s: SavedSearch): z.infer<typeof savedSearch> {
  return {
    id: s.id,
    name: s.name,
    query: s.query,
    filters: parseQuery(s.query),
    alerts: s.alerts,
    lastAlertAt: s.lastAlertAt ? iso(s.lastAlertAt) : null,
    createdAt: iso(s.createdAt),
  };
}
