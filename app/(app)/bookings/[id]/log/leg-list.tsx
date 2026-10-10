import { Trash2Icon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import type { AirportSummary } from "@/lib/airports";
import type { FlightLeg } from "@/lib/db/schema";
import { utcToZoned } from "@/lib/domain/time";
import { litresToOil, litresToVolume, type UnitSystem, type VolumeUnit } from "@/lib/domain/units";
import { deleteLeg } from "./actions";
import { LegDialog } from "./leg-dialog";

const text = (v: number | null, convert = (x: number) => x) =>
  v === null ? "" : String(Math.round(convert(v) * 10) / 10);
const clock = (d: Date | null, zone: string) => (d ? utcToZoned(d, zone).slice(11) : "");

/** The log's legs, with local times and UTC; edit and delete while the pilot may change them. */
export async function LegList({
  legs,
  airports,
  units,
  dipstick,
  editable,
  bookingId,
  logId,
  fuelUnit,
  oilUnit,
}: {
  legs: FlightLeg[];
  airports: Record<string, AirportSummary>;
  units: UnitSystem;
  /** Unit of the aircraft's oil readings. */
  dipstick: "qt" | "l";
  editable: boolean;
  bookingId: string;
  logId: string;
  fuelUnit: VolumeUnit;
  /** Label of the oil unit. */
  oilUnit: string;
}) {
  const t = await getTranslations("flightLog");
  if (!legs.length) return <p className="text-sm text-muted-foreground">{t("noLegs")}</p>;
  return (
    <ol className="grid gap-3">
      {legs.map((leg) => {
        const from = airports[leg.fromIdent];
        const to = airports[leg.toIdent];
        const fromZone = "UTC";
        const toZone = fromZone;
        const title = `${from?.code ?? leg.fromIdent} → ${to?.code ?? leg.toIdent}`;
        return (
          <li key={leg.id} className="grid gap-1 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {leg.seq}. {title}
              </span>
              {editable && (
                <div className="flex gap-1">
                  <LegDialog
                    bookingId={bookingId}
                    logId={logId}
                    fuelUnit={fuelUnit}
                    oilUnit={oilUnit}
                    from={from ?? null}
                    to={to ?? null}
                    label={t("editLegOf", { leg: title })}
                    values={{
                      legId: leg.id,
                      date: utcToZoned(leg.blockOff, fromZone).slice(0, 10),
                      blockOff: clock(leg.blockOff, fromZone),
                      engineStart: clock(leg.engineStart, fromZone),
                      takeoff: clock(leg.takeoffAt, fromZone),
                      landing: clock(leg.landingAt, toZone),
                      engineStop: clock(leg.engineStop, toZone),
                      blockOn: clock(leg.blockOn, toZone),
                      landings: String(leg.landings),
                      hobbsStart: text(leg.hobbsStart),
                      hobbsEnd: text(leg.hobbsEnd),
                      tachStart: text(leg.tachStart),
                      tachEnd: text(leg.tachEnd),
                      fuelBefore: text(leg.fuelBeforeL, (l) => litresToVolume(l, units)),
                      fuelAfter: text(leg.fuelAfterL, (l) => litresToVolume(l, units)),
                      oilBefore: text(leg.oilBeforeL, (l) => litresToOil(l, dipstick)),
                      oilAfter: text(leg.oilAfterL, (l) => litresToOil(l, dipstick)),
                    }}
                  />
                  <form action={deleteLeg}>
                    <input type="hidden" name="legId" value={leg.id} />
                    <input type="hidden" name="logId" value={logId} />
                    <input type="hidden" name="bookingId" value={bookingId} />
                    <Button variant="ghost" size="sm" aria-label={t("deleteLegOf", { leg: title })}>
                      <Trash2Icon aria-hidden /> {t("delete")}
                    </Button>
                  </form>
                </div>
              )}
            </div>
            <p>
              {utcToZoned(leg.blockOff, "UTC").slice(0, 10)} ·{" "}
              {t("blockTimes", { off: clock(leg.blockOff, "UTC"), on: clock(leg.blockOn, "UTC") })}
            </p>
            <p className="text-muted-foreground">
              {t("landingsCount", { count: leg.landings })}
              {leg.hobbsStart !== null &&
                ` · ${t("hobbs")} ${text(leg.hobbsStart)}–${text(leg.hobbsEnd) || "?"}`}
              {leg.tachStart !== null &&
                ` · ${t("tach")} ${text(leg.tachStart)}–${text(leg.tachEnd) || "?"}`}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
