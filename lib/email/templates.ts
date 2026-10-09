import { createTranslator } from "next-intl";

import { defaultLocale, intlLocale, isLocale, type Locale } from "@/lib/i18n/config";
import type { AircraftDocumentKind } from "@/lib/db/schema";
import { type CredentialRef, credentialLabel } from "@/lib/pilot/labels";
import { siteConfig } from "@/lib/site";
import bg from "@/messages/bg.json";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import it from "@/messages/it.json";

const catalogs = { en, bg, de, fr, it, es } satisfies Record<Locale, typeof en>;

function localeOf(locale: string | null | undefined): Locale {
  return isLocale(locale) ? locale : defaultLocale;
}

function translator(locale: string | null | undefined) {
  const l = localeOf(locale);
  return createTranslator({ locale: l, messages: catalogs[l], namespace: "email" });
}

/** Credential names ("Class 2 medical") in the email's language. */
function pilotLabel(locale: string | null | undefined, ref: CredentialRef) {
  const l = localeOf(locale);
  const t = createTranslator({ locale: l, messages: catalogs[l], namespace: "pilot" });
  return credentialLabel(ref, (key, values) => t(key as never, values as never));
}

function formatDate(locale: string | null | undefined, date: string) {
  return new Intl.DateTimeFormat(intlLocale(localeOf(locale)), {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

type Parts = {
  subject: string;
  greeting: string;
  paragraphs: string[];
  list?: string[];
  cta: string;
  url: string;
  locale: string | null | undefined;
};

/** Plain text + simple HTML version of an email with one button. */
function render({ subject, greeting, paragraphs, list, cta, url, locale }: Parts) {
  const fallback = translator(locale)("linkFallback");
  const text = [
    greeting,
    ...paragraphs,
    ...(list?.length ? [list.map((item) => `- ${item}`).join("\n")] : []),
    url,
  ].join("\n\n");
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    list?.length ? `<ul>${list.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : "",
    `<p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#0b5bd3;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(cta)}</a></p>`,
    `<p style="color:#666;font-size:12px">${escapeHtml(fallback)}<br>${url}</p>`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, text: `${text}\n`, html };
}

function build(
  kind: "verify" | "reset",
  { name, url, locale }: { name: string; url: string; locale?: string | null },
) {
  const t = translator(locale);
  const app = siteConfig.name;
  return render({
    subject: t(`${kind}.subject`, { app }),
    greeting: t(`${kind}.greeting`, { name }),
    paragraphs: [t(`${kind}.body`, { app })],
    cta: t(`${kind}.cta`),
    url,
    locale,
  });
}

export const verifyEmailEmail = (args: { name: string; url: string; locale?: string | null }) =>
  build("verify", args);
export const resetPasswordEmail = (args: { name: string; url: string; locale?: string | null }) =>
  build("reset", args);

/** Sent to a pilot when an admin verifies or rejects one of their credentials. */
export function credentialReviewedEmail({
  name,
  locale,
  item,
  decision,
  reason,
  url,
}: {
  name: string;
  locale?: string | null;
  item: CredentialRef;
  decision: "verify" | "reject";
  reason?: string | null;
  url: string;
}) {
  const t = translator(locale);
  const label = pilotLabel(locale, item);
  const verified = decision === "verify";
  return render({
    subject: verified
      ? t("credentialReviewed.verifiedSubject", { item: label })
      : t("credentialReviewed.rejectedSubject", { item: label }),
    greeting: t("credentialReviewed.greeting", { name }),
    paragraphs: verified
      ? [t("credentialReviewed.verifiedBody", { item: label })]
      : [
          t("credentialReviewed.rejectedBody", { item: label }),
          t("credentialReviewed.reason", { reason: reason ?? "" }),
          t("credentialReviewed.rejectedNext"),
        ],
    cta: t("credentialReviewed.cta"),
    url,
    locale,
  });
}

/** Sent once per credential, 30 days (or less) before it expires. */
export function expiryReminderEmail({
  name,
  locale,
  items,
  url,
}: {
  name: string;
  locale?: string | null;
  items: { ref: CredentialRef; expiresOn: string }[];
  url: string;
}) {
  const t = translator(locale);
  return render({
    subject: t("expiryReminder.subject", { count: items.length }),
    greeting: t("expiryReminder.greeting", { name }),
    paragraphs: [t("expiryReminder.body")],
    list: items.map((i) =>
      t("expiryReminder.item", {
        item: pilotLabel(locale, i.ref),
        date: formatDate(locale, i.expiresOn),
      }),
    ),
    cta: t("expiryReminder.cta"),
    url,
    locale,
  });
}

/** Aircraft document names ("Airworthiness Review Certificate (ARC)") in the email's language. */
function aircraftDocumentLabel(locale: string | null | undefined, kind: AircraftDocumentKind) {
  const l = localeOf(locale);
  const t = createTranslator({ locale: l, messages: catalogs[l], namespace: "aircraft.documents" });
  return t(`kinds.${kind}`);
}

/** Sent to an owner when an admin verifies or rejects an aircraft document. */
export function aircraftDocumentReviewedEmail({
  name,
  locale,
  registration,
  kind,
  decision,
  reason,
  url,
}: {
  name: string;
  locale?: string | null;
  registration: string;
  kind: AircraftDocumentKind;
  decision: "verify" | "reject";
  reason?: string | null;
  url: string;
}) {
  const t = translator(locale);
  const item = aircraftDocumentLabel(locale, kind);
  const verified = decision === "verify";
  return render({
    subject: verified
      ? t("aircraftDocumentReviewed.verifiedSubject", { item, registration })
      : t("aircraftDocumentReviewed.rejectedSubject", { item, registration }),
    greeting: t("aircraftDocumentReviewed.greeting", { name }),
    paragraphs: verified
      ? [t("aircraftDocumentReviewed.verifiedBody", { item, registration })]
      : [
          t("aircraftDocumentReviewed.rejectedBody", { item, registration }),
          t("aircraftDocumentReviewed.reason", { reason: reason ?? "" }),
          t("aircraftDocumentReviewed.rejectedNext"),
        ],
    cta: t("aircraftDocumentReviewed.cta"),
    url,
    locale,
  });
}

/** Sent once per aircraft document, 30 days (or less) before it expires. */
export function aircraftExpiryReminderEmail({
  name,
  locale,
  items,
  url,
}: {
  name: string;
  locale?: string | null;
  items: { registration: string; kind: AircraftDocumentKind; expiresOn: string }[];
  url: string;
}) {
  const t = translator(locale);
  return render({
    subject: t("aircraftExpiryReminder.subject", { count: items.length }),
    greeting: t("aircraftExpiryReminder.greeting", { name }),
    paragraphs: [t("aircraftExpiryReminder.body")],
    list: items.map((i) =>
      t("aircraftExpiryReminder.item", {
        registration: i.registration,
        item: aircraftDocumentLabel(locale, i.kind),
        date: formatDate(locale, i.expiresOn),
      }),
    ),
    cta: t("aircraftExpiryReminder.cta"),
    url,
    locale,
  });
}

/** Sent when the daily job unlists an aircraft because its ARC or insurance expired. */
export function aircraftUnlistedEmail({
  name,
  locale,
  registration,
  reason,
  url,
}: {
  name: string;
  locale?: string | null;
  registration: string;
  reason: "arc" | "insurance";
  url: string;
}) {
  const t = translator(locale);
  return render({
    subject: t("aircraftUnlisted.subject", { registration }),
    greeting: t("aircraftUnlisted.greeting", { name }),
    paragraphs: [t(`aircraftUnlisted.${reason}`, { registration }), t("aircraftUnlisted.next")],
    cta: t("aircraftUnlisted.cta"),
    url,
    locale,
  });
}

/** Sent to the owner as soon as a defect is reported on their aircraft (BKG-8). */
export function defectReportedEmail({
  name,
  locale,
  registration,
  reporter,
  severity,
  description,
  url,
}: {
  name: string;
  locale?: string | null;
  registration: string;
  reporter: string;
  severity: "minor" | "major" | "unsafe";
  description: string;
  url: string;
}) {
  const t = translator(locale);
  return render({
    subject: t(`defectReported.subject.${severity}`, { registration }),
    greeting: t("defectReported.greeting", { name }),
    paragraphs: [
      t("defectReported.body", { registration, reporter }),
      t(`defectReported.severity.${severity}`),
      description,
      t("defectReported.next"),
    ],
    cta: t("defectReported.cta"),
    url,
    locale,
  });
}

/** A booking notification by email (BKG-9): what happened, which aircraft and when. */
export function bookingNotificationEmail({
  name,
  locale,
  type,
  registration,
  from,
  timeZone,
  other,
  url,
}: {
  name: string;
  locale?: string | null;
  type:
    | "requested"
    | "accepted"
    | "declined"
    | "proposed"
    | "expired"
    | "cancelled"
    | "checked_out"
    | "log_submitted"
    | "log_correction"
    | "log_confirmed"
    | "defect_reported"
    | "instant_booked"
    | "review_submitted"
    | "reviews_published"
    | "review_replied"
    | "reminder"
    | "calendar_conflict"
    | "other";
  registration: string;
  from: Date;
  timeZone: string;
  /** Who did it (empty when the system did). */
  other: string;
  url: string;
}) {
  const t = translator(locale);
  // Aviation runs on UTC: times in emails are UTC too.
  const when = `${new Intl.DateTimeFormat(intlLocale(localeOf(locale)), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
    hourCycle: "h23",
  }).format(from)} UTC`;
  const values = { registration, when, other: other || t("booking.someone") };
  return render({
    subject: t(`booking.${type}.subject`, values),
    greeting: t("booking.greeting", { name }),
    paragraphs: [t(`booking.${type}.body`, values)],
    cta: t("booking.cta"),
    url,
    locale,
  });
}

/** A new message (MSG-1): one email per unread streak, without the text (read it in the app). */
export function newMessageEmail({
  name,
  locale,
  sender,
  registration,
  url,
}: {
  name: string;
  locale?: string | null;
  sender: string;
  registration: string;
  url: string;
}) {
  const t = translator(locale);
  return render({
    subject: t("newMessage.subject", { sender, registration }),
    greeting: t("newMessage.greeting", { name }),
    paragraphs: [t("newMessage.body", { sender, registration })],
    cta: t("newMessage.cta"),
    url,
    locale,
  });
}
