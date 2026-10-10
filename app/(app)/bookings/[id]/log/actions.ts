"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { getUnits } from "@/lib/aircraft/queries";
import { requireUser } from "@/lib/auth/session";
import {
  confirmFlightLog,
  requestLogCorrection,
  saveCheckoutReadings,
  startFlightLog,
  submitFlightLog,
} from "@/lib/bookings/flight-log-ops";
import { deleteLeg as removeLeg, saveLeg as storeLeg } from "@/lib/bookings/log-entries";
import type { Done } from "@/lib/bookings/outcome";
import { getBooking } from "@/lib/bookings/queries";
import { type LegTimeIssue, legTimeIssues, legTimesToUtc } from "@/lib/domain/leg-times";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { sendNotificationsSoon } from "@/lib/notifications/soon";
import { checkoutSchema, legSchema } from "@/lib/validation/flight-log";

// The flight log's forms (BKG-7, BKG-12, BKG-14): parse and translate here; the work is done by
// lib/bookings (the same functions the API uses).

const idSchema = z.uuid();

function refresh(bookingId: string) {
  revalidatePath(`/bookings/${bookingId}`, "layout");
  revalidatePath("/bookings");
}

/** Booking, aircraft units and zone for the log's forms (after the RLS access check). */
async function context(userId: string, bookingId: string) {
  const detail = await getBooking(userId, bookingId);
  if (!detail) return null;
  return { detail, units: await getUnits(userId), oilUnit: detail.aircraft.oilUnit };
}

/** Check-out: start the rental's flight log (BKG-7); with passengers, FCL.060 is confirmed. */
export async function startCheckout(formData: FormData) {
  const user = await requireUser("/bookings");
  const bookingId = idSchema.parse(formData.get("bookingId"));
  sendNotificationsSoon();
  const outcome = await startFlightLog(user.id, bookingId, formData.get("recency") === "on");
  if (!outcome.ok) {
    redirect(`/bookings/${bookingId}?checkout=${encodeURIComponent(outcome.error)}`);
  }
  refresh(bookingId);
  redirect(`/bookings/${bookingId}/log`);
}

/** Save the check-out readings. */
export async function saveCheckout(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/bookings");
  const t = await getTranslations("flightLog");
  const raw = formValues(formData);
  const ctx = await context(user.id, raw.bookingId ?? "");
  if (!ctx) return { message: t("errors.not_found") };
  const parsed = checkoutSchema(ctx.units, ctx.oilUnit).safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const { logId, ...values } = parsed.data;
  const outcome = await saveCheckoutReadings(user.id, logId, values);
  if (!outcome.ok) return { message: t("errors.not_editable"), values: raw };
  refresh(ctx.detail.booking.id);
  return { ok: true, message: t("saved"), values: raw };
}

/** Times out of order as form errors ("Can't be before Engine start"). */
async function orderErrors(issues: LegTimeIssue[]) {
  const [t, v] = await Promise.all([getTranslations("flightLog"), getTranslations("validation")]);
  return Object.fromEntries(
    issues.map((i) => [
      i.field,
      [v(i.rule === "after" ? "timeAfter" : "timeNotBefore", { other: t(i.other) })],
    ]),
  );
}

/** The order issues of the typed clock times, to show with other field errors at once. */
function rawOrderIssues(raw: Record<string, string>) {
  const times = legTimesToUtc({
    date: raw.date ?? "",
    fromZone: "UTC",
    toZone: "UTC",
    engineStart: raw.engineStart ?? "",
    blockOff: raw.blockOff ?? "",
    takeoff: raw.takeoff,
    landing: raw.landing,
    blockOn: raw.blockOn ?? "",
    engineStop: raw.engineStop ?? "",
  });
  return times ? legTimeIssues(times) : [];
}

/** Add or change one leg (BKG-12). Times (UTC) must be in the order they happen. */
export async function saveLeg(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/bookings");
  const t = await getTranslations("flightLog");
  const v = await getTranslations("validation");
  const raw = formValues(formData);
  const ctx = await context(user.id, raw.bookingId ?? "");
  if (!ctx) return { message: t("errors.not_found") };
  const parsed = legSchema(ctx.units, ctx.oilUnit).safeParse(raw);
  if (!parsed.success) {
    const errors = {
      ...(await localizedFieldErrors(parsed.error)),
      ...(await orderErrors(rawOrderIssues(raw))),
    };
    return { errors, values: raw };
  }
  const times = legTimesToUtc({ ...parsed.data, fromZone: "UTC", toZone: "UTC" });
  if (!times) return { errors: { engineStop: [v("timeInvalid")] }, values: raw };
  const {
    logId,
    legId,
    date: _date,
    engineStart: _engineStart,
    blockOff: _blockOff,
    takeoff: _takeoff,
    landing: _landing,
    blockOn: _blockOn,
    engineStop: _engineStop,
    ...rest
  } = parsed.data;
  const outcome = await storeLeg(user.id, logId, legId ?? null, { ...rest, ...times });
  if (!outcome.ok) {
    if (outcome.error === "leg_order") {
      return { errors: await orderErrors(outcome.issues ?? []), values: raw };
    }
    if (outcome.error === "unknown_airfield") {
      return { errors: { [outcome.field ?? "from"]: [v("airportUnknown")] }, values: raw };
    }
    const known = ["not_editable", "leg_checks"];
    return {
      message: t(
        `errors.${known.includes(outcome.error) ? outcome.error : "failed"}` as "errors.failed",
      ),
      values: raw,
    };
  }
  refresh(ctx.detail.booking.id);
  return { ok: true, message: t("legSaved") };
}

/** Remove a leg while the log is still editable. */
export async function deleteLeg(formData: FormData) {
  const user = await requireUser("/bookings");
  const legId = idSchema.parse(formData.get("legId"));
  const logId = idSchema.parse(formData.get("logId"));
  const bookingId = idSchema.parse(formData.get("bookingId"));
  await removeLeg(user.id, logId, legId);
  refresh(bookingId);
}

const STATUS_ERRORS = [
  "not_found",
  "not_editable",
  "no_legs",
  "not_submitted",
  "note_required",
  "bad_amount",
  "missing_meters",
];

/** Translate a status change's outcome for the form. */
async function statusOutcome(outcome: Done, raw: Record<string, string>): Promise<FormState> {
  if (!outcome.ok) {
    const t = await getTranslations("flightLog");
    const key = STATUS_ERRORS.includes(outcome.error) ? outcome.error : "failed";
    return { message: t(`errors.${key}` as "errors.failed"), values: raw };
  }
  refresh(raw.bookingId ?? "");
  return { ok: true };
}

/** Check-in: the pilot submits the log to the owner. */
export async function submitLog(_prev: FormState, formData: FormData) {
  const user = await requireUser("/bookings");
  sendNotificationsSoon();
  const raw = formValues(formData);
  const logId = idSchema.safeParse(raw.logId);
  if (!logId.success) return statusOutcome({ ok: false, error: "not_found" }, raw);
  return statusOutcome(await submitFlightLog(user.id, logId.data), raw);
}

/** The owner asks for a correction. */
export async function requestCorrection(_prev: FormState, formData: FormData) {
  const user = await requireUser("/bookings");
  sendNotificationsSoon();
  const raw = formValues(formData);
  const logId = idSchema.safeParse(raw.logId);
  if (!logId.success) return statusOutcome({ ok: false, error: "not_found" }, raw);
  return statusOutcome(await requestLogCorrection(user.id, logId.data, raw.note ?? ""), raw);
}

/** The owner confirms: the flown time and amount due are worked out once more on the server. */
export async function confirmLog(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/bookings");
  sendNotificationsSoon();
  const raw = formValues(formData);
  const bookingId = idSchema.safeParse(raw.bookingId);
  if (!bookingId.success) return statusOutcome({ ok: false, error: "not_found" }, raw);
  return statusOutcome(await confirmFlightLog(user.id, bookingId.data), raw);
}
