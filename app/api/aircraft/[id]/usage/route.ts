import { getTranslations } from "next-intl/server";

import { getOwnAircraft, isUuid } from "@/lib/aircraft/queries";
import { getUser } from "@/lib/auth/session";
import { getMyPlan } from "@/lib/billing/plan";
import { usageSince } from "@/lib/billing/plans";
import { airportCodes, getAircraftUsage, pilotNames } from "@/lib/bookings/usage";
import { csvResponse, toCsv } from "@/lib/csv";

const utc = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "");
const minutes = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 60_000);

/**
 * The owner's CSV of the legs of an aircraft's confirmed flight logs (BKG-16): all of them, or the
 * last months on the Free plan (SUB-10). SI units, UTC.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/aircraft/[id]/usage">) {
  const { id } = await ctx.params;
  const user = await getUser();
  if (!user || !isUuid(id)) return new Response("Not found", { status: 404 });
  const plane = await getOwnAircraft(user.id, id);
  if (!plane) return new Response("Not found", { status: 404 });

  const t = await getTranslations("usage.csv");
  const { plan } = await getMyPlan(user.id);
  const { legs } = await getAircraftUsage(user.id, id, usageSince(plan));
  const [names, codes] = await Promise.all([
    pilotNames(
      user.id,
      legs.map((l) => l.pilotId),
    ),
    airportCodes(legs.flatMap((l) => [l.fromIdent, l.toIdent])),
  ]);
  const header = [
    "date",
    "booking",
    "pilot",
    "from",
    "to",
    "blockOff",
    "blockOn",
    "blockMinutes",
    "engineStart",
    "engineStop",
    "engineMinutes",
    "takeoff",
    "landing",
    "landings",
    "hobbsStart",
    "hobbsEnd",
    "tachStart",
    "tachEnd",
    "fuelBefore",
    "fuelAfter",
    "oilBefore",
    "oilAfter",
  ].map((key) => t(key as "date"));
  const rows = legs.map((l) => [
    l.blockOff.toISOString().slice(0, 10),
    l.bookingId,
    l.pilotId ? (names.get(l.pilotId) ?? "") : t("deletedPilot"),
    codes.get(l.fromIdent) ?? l.fromIdent,
    codes.get(l.toIdent) ?? l.toIdent,
    utc(l.blockOff),
    utc(l.blockOn),
    minutes(l.blockOff, l.blockOn),
    utc(l.engineStart),
    utc(l.engineStop),
    minutes(l.engineStart, l.engineStop),
    utc(l.takeoffAt),
    utc(l.landingAt),
    l.landings,
    l.hobbsStart,
    l.hobbsEnd,
    l.tachStart,
    l.tachEnd,
    l.fuelBeforeL,
    l.fuelAfterL,
    l.oilBeforeL,
    l.oilAfterL,
  ]);
  const date = new Date().toISOString().slice(0, 10);
  return csvResponse(toCsv(header, rows), `${plane.registration}-usage-${date}.csv`);
}
