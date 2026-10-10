import { createTranslator } from "next-intl";

import bg from "@/messages/bg.json";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import it from "@/messages/it.json";
import { defaultLocale, isLocale, type Locale } from "./config";

// All translations, for texts made outside a page (emails, API answers in the user's language).

export const catalogs = { en, bg, de, fr, it, es } satisfies Record<Locale, typeof en>;

export const localeOf = (locale: string | null | undefined): Locale =>
  isLocale(locale) ? locale : defaultLocale;

/** A loosely typed translator for one namespace (keys are checked by the callers' tests). */
export function translatorFor(locale: string | null | undefined, namespace: string) {
  const l = localeOf(locale);
  const t = createTranslator({ locale: l, messages: catalogs[l], namespace: namespace as never });
  return t as unknown as (key: string, values?: Record<string, string | number>) => string;
}
