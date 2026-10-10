import { FileTextIcon, Trash2Icon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/aircraft/format";
import type { AirportSummary } from "@/lib/airports";
import type { FlightUplift } from "@/lib/db/schema";
import { litresToOil, litresToVolume, type UnitSystem, type VolumeUnit } from "@/lib/domain/units";
import type { Locale } from "@/lib/i18n/config";
import type { FuelType } from "@/lib/domain/log-checks";
import { UpliftDialog } from "./uplift-dialog";
import { deleteUplift } from "./uplift-actions";

const text = (v: number | null, convert = (x: number) => x) =>
  v === null ? "" : String(Math.round(convert(v) * 10) / 10);

/** Fuel and oil added during the rental, with receipts (BKG-13, BKG-14). */
export async function UpliftList({
  uplifts,
  airports,
  receipts,
  units,
  dipstick,
  editable,
  bookingId,
  logId,
  fuelUnit,
  oilUnit,
  currency,
  fuelTypes,
  aircraftFuel,
}: {
  uplifts: FlightUplift[];
  airports: Record<string, AirportSummary>;
  receipts: Record<string, { id: string; filename: string }>;
  units: UnitSystem;
  dipstick: "qt" | "l";
  editable: boolean;
  bookingId: string;
  logId: string;
  fuelUnit: VolumeUnit;
  oilUnit: string;
  currency: string;
  fuelTypes: { value: string; label: string }[];
  aircraftFuel: FuelType;
}) {
  const t = await getTranslations("flightLog");
  const ta = await getTranslations("aircraft");
  const locale = (await getLocale()) as Locale;
  if (!uplifts.length) return <p className="text-sm text-muted-foreground">{t("noUplifts")}</p>;
  return (
    <ul className="grid gap-3">
      {uplifts.map((u) => {
        const airport = airports[u.airportIdent];
        const code = airport?.code ?? u.airportIdent;
        const quantity =
          u.kind === "fuel"
            ? `${text(u.quantityL, (l) => litresToVolume(l, units))} ${t(`units.${fuelUnit}`)}`
            : `${text(u.quantityL, (l) => litresToOil(l, dipstick))} ${oilUnit}`;
        const what =
          u.kind === "fuel" ? (u.fuelType ? ta(`fuelTypes.${u.fuelType}`) : "") : u.oilGrade;
        const title = `${t(`kinds.${u.kind}`)} ${quantity} · ${code}`;
        const receipt = u.receiptId ? receipts[u.receiptId] : undefined;
        return (
          <li key={u.id} className="grid gap-1 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {title}
                {what && <span className="text-muted-foreground"> · {what}</span>}
              </span>
              {editable && (
                <div className="flex gap-1">
                  <UpliftDialog
                    bookingId={bookingId}
                    logId={logId}
                    fuelUnit={fuelUnit}
                    oilUnit={oilUnit}
                    currency={currency}
                    fuelTypes={fuelTypes}
                    aircraftFuel={aircraftFuel}
                    airport={airport ?? null}
                    receipt={receipt ?? null}
                    label={t("editUpliftOf", { uplift: title })}
                    values={{
                      upliftId: u.id,
                      kind: u.kind,
                      quantity:
                        u.kind === "fuel"
                          ? text(u.quantityL, (l) => litresToVolume(l, units))
                          : text(u.quantityL, (l) => litresToOil(l, dipstick)),
                      fuelType: u.fuelType ?? "",
                      oilGrade: u.oilGrade ?? "",
                      price: text(u.price),
                      paidBy: u.paidBy,
                    }}
                  />
                  <form action={deleteUplift}>
                    <input type="hidden" name="upliftId" value={u.id} />
                    <input type="hidden" name="logId" value={logId} />
                    <input type="hidden" name="bookingId" value={bookingId} />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("deleteUpliftOf", { uplift: title })}
                    >
                      <Trash2Icon aria-hidden /> {t("delete")}
                    </Button>
                  </form>
                </div>
              )}
            </div>
            <p className="text-muted-foreground">
              {u.price !== null ? formatPrice(u.price, currency, locale) : t("noPrice")} ·{" "}
              {t(`payers.${u.paidBy}`)}
              {receipt && (
                <>
                  {" · "}
                  <a
                    href={`/api/documents/${receipt.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline underline-offset-2"
                  >
                    <FileTextIcon className="size-3.5" aria-hidden /> {t("receiptLink")}
                  </a>
                </>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
