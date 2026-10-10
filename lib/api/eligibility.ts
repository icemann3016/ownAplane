import "server-only";

import { getOwnSettings } from "@/lib/account/profile";
import { type EligibilityFailure, eligibilityText } from "@/lib/aircraft/eligibility-text";
import { translatorFor } from "@/lib/i18n/catalogs";
import type { PilotTranslate } from "@/lib/pilot/labels";

/** Failed requirements with a sentence in the user's language, for apps to show (RAT-8). */
export async function eligibilityReasons(
  userId: string,
  failures: EligibilityFailure[],
  typeDesignator: string,
) {
  const { locale } = await getOwnSettings(userId);
  const t = translatorFor(locale, "aircraft.eligibility");
  const tp = translatorFor(locale, "pilot") as unknown as PilotTranslate;
  return failures.map((f) => ({
    requirement: f.requirement,
    blocking: f.blocking,
    need: f.need,
    have: f.have,
    text: eligibilityText(f, t, tp, typeDesignator),
  }));
}
