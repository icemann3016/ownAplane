import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { KnownItems } from "@/components/bookings/known-items";
import { WeatherCard } from "@/components/bookings/weather-card";
import { ReportDefectDialog } from "@/components/bookings/report-defect-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FUEL_TYPES } from "@/lib/aircraft/catalog";
import { getUnits, isUuid } from "@/lib/aircraft/queries";
import { requireUser } from "@/lib/auth/session";
import { bookingAmount } from "@/lib/bookings/amount";
import { getFlightLog } from "@/lib/bookings/flight-log";
import { getBooking } from "@/lib/bookings/queries";
import { getKnownItems } from "@/lib/bookings/remarks";
import { getLogChecks } from "@/lib/bookings/log-checks";
import { getMeterCheck } from "@/lib/bookings/meter-gap";
import { logAirports, logDocuments } from "@/lib/bookings/log-view";
import { fuelSettlement } from "@/lib/domain/flight-log";
import { continuityIssues } from "@/lib/domain/fuel-checks";
import { litresToOil, litresToVolume, volumeUnitOf } from "@/lib/domain/units";
import { CheckoutCard } from "./checkout-card";
import { ContinuityAlert } from "./continuity-alert";
import { LegsCard } from "./legs-card";
import { LogChecksAlert, WrongFuelAlert } from "./log-checks-alert";
import { MeterGapAlert } from "./meter-gap-alert";
import { LogSummary } from "./log-summary";
import { RemarksCard } from "./remarks-card";
import { UpliftsCard } from "./uplifts-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("flightLog");
  return { title: t("title") };
}

const num = (v: number | null, round = (x: number) => x) =>
  v === null ? "" : String(Math.round(round(v) * 10) / 10);

/**
 * The flight log of a rental: check-out, legs, fuel and oil, remarks, check-in and the owner's
 * confirmation (BKG-7, BKG-12…15).
 */
export default async function FlightLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/bookings/${id}/log`);
  if (!isUuid(id)) notFound();
  const detail = await getBooking(user.id, id);
  if (!detail) notFound();
  const { booking: b, period, aircraft: plane } = detail;
  const role = b.pilotId === user.id ? "pilot" : b.ownerId === user.id ? "owner" : null;
  if (!role) notFound();
  const data = await getFlightLog(user.id, id);
  if (!data) redirect(`/bookings/${id}`);
  const { log, legs, uplifts, remarks } = data;
  const t = await getTranslations("flightLog");
  const units = await getUnits(user.id);
  const fuelUnit = volumeUnitOf(units);
  const oilUnit = t(plane.oilUnit === "qt" ? "units.qt" : "units.l");
  const editable =
    role === "pilot" && (log.status === "draft" || log.status === "correction_requested");
  const timeZone = "UTC";
  // Confirmed logs keep the fuel settlement agreed then; open ones follow the entries.
  const fuel = fuelSettlement(uplifts, b.priceBasis);
  const adjustment = log.status === "confirmed" ? (log.fuelAdjustment ?? 0) : fuel.adjustment;
  const result = bookingAmount(b, period, timeZone, legs, adjustment);
  const docs = await logDocuments(user.id, [
    log.checkoutPhotoId,
    ...uplifts.map((u) => u.receiptId),
  ]);
  const photo = log.checkoutPhotoId ? (docs[log.checkoutPhotoId] ?? null) : null;
  const airports = await logAirports([
    b.departureIdent,
    ...legs.flatMap((l) => [l.fromIdent, l.toIdent]),
    ...uplifts.map((u) => u.airportIdent),
    ...remarks.flatMap((r) => (r.airportIdent ? [r.airportIdent] : [])),
  ]);
  const knownItems = await getKnownItems(user.id, plane.id);
  const lastAirport = airports[legs.at(-1)?.toIdent ?? b.departureIdent] ?? null;
  const common = { bookingId: b.id, logId: log.id, fuelUnit, oilUnit };
  const ta = await getTranslations("aircraft");
  const upliftProps = {
    ...common,
    currency: b.currency,
    fuelTypes: FUEL_TYPES.map((f) => ({ value: f, label: ta(`fuelTypes.${f}`) })),
    aircraftFuel: plane.fuelType,
  };
  const checks = await getLogChecks(user.id, detail, data);
  const meters = await getMeterCheck(log, plane.id, role);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <Button variant="ghost" size="sm" className="-ml-3 justify-self-start" asChild>
        <Link href={`/bookings/${b.id}`}>
          <ArrowLeftIcon aria-hidden /> {t("back")}
        </Link>
      </Button>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">
          <span className="font-mono">{plane.registration}</span> · {t(`statuses.${log.status}`)}
        </p>
      </div>
      <Alert>
        <InfoIcon />
        <AlertDescription>{t("disclaimer")}</AlertDescription>
      </Alert>
      <WrongFuelAlert checks={checks} />
      {role === "pilot" && <KnownItems items={knownItems} />}
      {(log.status === "draft" || log.status === "correction_requested") && (
        <WeatherCard
          userId={user.id}
          isPilot={role === "pilot"}
          route={detail.route}
          period={period}
          aircraftIfr={plane.ifr}
        />
      )}
      {log.correctionNote && log.status === "correction_requested" && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{t("correctionNote", { note: log.correctionNote })}</AlertDescription>
        </Alert>
      )}

      <CheckoutCard
        {...common}
        editable={editable}
        photo={photo}
        values={{
          hobbsStart: num(log.hobbsStart),
          tachStart: num(log.tachStart),
          fuelStart: num(log.fuelStartL, (l) => litresToVolume(l, units)),
          oilStart: num(log.oilStartL, (l) => litresToOil(l, plane.oilUnit)),
        }}
      />

      <LegsCard
        list={{ legs, airports, units, dipstick: plane.oilUnit, editable, ...common }}
        from={lastAirport}
      />

      <UpliftsCard
        list={{
          uplifts,
          airports,
          receipts: docs,
          units,
          dipstick: plane.oilUnit,
          editable,
          ...upliftProps,
        }}
        airport={lastAirport}
      />

      <RemarksCard
        bookingId={b.id}
        logId={log.id}
        remarks={remarks}
        airports={airports}
        role={role}
        editable={editable}
        defaultAirport={lastAirport}
      />

      {role === "pilot" && <ReportDefectDialog aircraftId={plane.id} bookingId={b.id} />}

      <ContinuityAlert
        issues={continuityIssues(log, legs, uplifts, b.departureIdent)}
        units={units}
        dipstick={plane.oilUnit}
      />
      <MeterGapAlert check={meters} role={role} bookingId={b.id} logId={log.id} />
      <LogChecksAlert checks={checks} units={units} />

      <LogSummary
        bookingId={b.id}
        logId={log.id}
        role={role}
        status={log.status}
        editable={editable}
        hasLegs={legs.length > 0}
        timeBasis={b.timeBasis}
        priceBasis={b.priceBasis}
        currency={b.currency}
        result={result}
        confirmedAmount={log.amountDue}
        unpriced={fuel.unpriced}
      />
    </div>
  );
}
