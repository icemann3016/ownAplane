// How someone proves they represent an airfield (APT-1), and small helpers for its texts. Pure.

/** Free email providers: an address there says nothing about the airport. */
const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "gmx.de",
  "gmx.at",
  "web.de",
  "t-online.de",
  "freenet.de",
  "mail.com",
  "mail.ru",
  "yandex.com",
  "yandex.ru",
  "zoho.com",
  "tutanota.com",
  "abv.bg",
  "mail.bg",
  "dir.bg",
  "libero.it",
  "virgilio.it",
  "orange.fr",
  "laposte.net",
  "free.fr",
  "wanadoo.fr",
  "sfr.fr",
  "seznam.cz",
  "wp.pl",
  "o2.pl",
  "interia.pl",
  "onet.pl",
  "terra.es",
  "telefonica.net",
]);

const EMAIL = /^[^@\s]+@([^@\s]+\.[^@\s]+)$/;

/** The address's domain in lower case, or null when it isn't an email address. */
export function emailDomain(email: string): string | null {
  const match = EMAIL.exec(email.trim().toLowerCase());
  return match ? match[1]! : null;
}

/** An address on an organisation's own domain (not a free mail provider, or a subdomain of one). */
export function isWorkEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  const parts = domain.split(".");
  return !parts.some((_, i) => FREE_MAIL.has(parts.slice(i).join(".")));
}

/**
 * How long an email code works, how often and how many times per claim one can be sent, and how
 * many guesses each allows.
 */
export const CODE_VALID_MS = 30 * 60 * 1000;
export const CODE_RESEND_MS = 60 * 1000;
export const CODE_SENDS = 5;
export const CODE_TRIES = 5;

/** "LBSF Sofia" for texts. */
export const airportLabel = (a: { ident: string; icaoCode: string | null; name: string }) =>
  `${a.icaoCode ?? a.ident} ${a.name}`;
