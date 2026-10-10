import {
  CLASS_RATINGS,
  LICENCE_LABELS,
  type LicenceTypeCode,
  PRIVILEGES,
} from "@/lib/pilot/catalog";
import { credentialLabel, type PilotTranslate } from "@/lib/pilot/labels";

/** One failed requirement from public.my_eligibility(). */
export type EligibilityFailure = {
  requirement: string;
  blocking: boolean;
  need: string | null;
  have: string | null;
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

const num = (v: string | null) => Number(v ?? 0);

function ratingName(code: string, tp: PilotTranslate): string {
  const ratingKind = (CLASS_RATINGS as readonly string[]).includes(code)
    ? "class"
    : (PRIVILEGES as readonly string[]).includes(code)
      ? "privilege"
      : "type";
  return credentialLabel({ kind: "rating", ratingKind, code }, tp);
}

/**
 * A readable reason, e.g. "Requires ≥ 50 h on DA40, you have 12 h" (RAT-8). `t` translates keys
 * under aircraft.eligibility, `tp` under pilot.
 */
export function eligibilityText(
  f: EligibilityFailure,
  t: Translate,
  tp: PilotTranslate,
  typeDesignator: string,
): string {
  switch (f.requirement) {
    case "licence_type":
      return t("licence_type", {
        list: (f.need ?? "")
          .split(",")
          .map((l) => LICENCE_LABELS[l as LicenceTypeCode] ?? tp("licences.other"))
          .join(", "),
      });
    case "class_rating":
    case "rating":
      return t(f.requirement, { rating: ratingName(f.need ?? "", tp) });
    case "total_hours":
    case "recent_hours":
    case "type_hours":
    case "pilot_rating":
      return t(f.requirement, { need: num(f.need), have: num(f.have), type: typeDesignator });
    case "lapl_mtom":
      return t(f.requirement, { need: num(f.need), have: num(f.have) });
    case "lapl_passengers":
      return t(f.requirement);
    case "age":
    case "age_unknown":
      return t(f.requirement, { need: num(f.need), have: num(f.have) });
    case "own_aircraft":
    case "suspended":
    case "licence":
    case "medical":
    case "unrated":
    case "checkout":
    case "aircraft_unavailable":
    case "aircraft_no_night":
    case "night_rating":
    case "night_flight":
      return t(f.requirement);
    default:
      return t("unknown");
  }
}
