"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { getUnits } from "@/lib/aircraft/queries";
import { getAirport } from "@/lib/airports";
import { requireUser } from "@/lib/auth/session";
import { bookingAmount } from "@/lib/bookings/amount";
import { getFlightLog } from "@/lib/bookings/flight-log";
import { getBooking } from "@/lib/bookings/queries";
import { asUser } from "@/lib/db/rls";
import { flightLegs, flightLogs } from "@/lib/db/schema";
import { fuelSettlement } from "@/lib/domain/flight-log";
import { legTimeIssues, legTimesToUtc } from "@/lib/domain/leg-times";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { checkoutSchema, legSchema } from "@/lib/validation/flight-log";
import { sendNotificationsSoon } from "@/lib/notifications/soon";

const idSchema = z.uuid();

/** Postgres error (code, message) of a failed query (drizzle wraps the driver error). */
function pgError(e: unknown) {
  const err = e as { cause?: { code?: string; message?: string } };
  return { code: err.cause?.code, message: err.cause?.message };
}

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

/** Check-out: start the rental's flight log (BKG-7). */
export async function startCheckout(formData: FormData) {
  const user = await requireUser("/bookings");
  const bookingId = idSchema.parse(formData.get("bookingId"));
  // FCL.060: with passengers the pilot confirms 3 take-offs and landings in the last 90 days.
  const recency = formData.get("recency") === "on";
  sendNotificationsSoon();
  try {
    await asUser(user.id, (tx) =>
      tx.execute(sql`select public.start_flight_log(${bookingId}::uuid, ${recency})`),
    );
  } catch (e) {
    const { code, message } = pgError(e);
    if (code !== "P0001") throw e;
    redirect(`/bookings/${bookingId}?checkout=${encodeURIComponent(message ?? "failed")}`);
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
  const rows = await asUser(user.id, (tx) =>
    tx
      .update(flightLogs)
      .set(values)
      .where(eq(flightLogs.id, logId))
      .returning({ id: flightLogs.id }),
  );
  if (!rows.length) return { message: t("errors.not_editable"), values: raw };
  refresh(ctx.detail.booking.id);
  return { ok: true, message: t("saved"), values: raw };
}

/** Times out of order, as form errors (UTC clock times; see legTimeIssues). */
async function legOrderErrors(raw: Record<string, string>) {
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
  if (!times) return { times, errors: {} };
  const [t, v] = await Promise.all([getTranslations("flightLog"), getTranslations("validation")]);
  const errors: Record<string, string[]> = Object.fromEntries(
    legTimeIssues(times).map((i) => [
      i.field,
      [v(i.rule === "after" ? "timeAfter" : "timeNotBefore", { other: t(i.other) })],
    ]),
  );
  return { times, errors };
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
  const order = await legOrderErrors(raw);
  if (!parsed.success) {
    const errors = { ...(await localizedFieldErrors(parsed.error)), ...order.errors };
    return { errors, values: raw };
  }
  if (Object.keys(order.errors).length) return { errors: order.errors, values: raw };
  if (!order.times) return { errors: { engineStop: [v("timeInvalid")] }, values: raw };
  const {
    logId,
    legId,
    from,
    to,
    date: _date,
    engineStart: _engineStart,
    blockOff: _blockOff,
    takeoff: _takeoff,
    landing: _landing,
    blockOn: _blockOn,
    engineStop: _engineStop,
    ...rest
  } = parsed.data;
  const [fromAirport, toAirport] = await Promise.all([getAirport(from), getAirport(to)]);
  if (!fromAirport) return { errors: { from: [v("airportUnknown")] }, values: raw };
  if (!toAirport) return { errors: { to: [v("airportUnknown")] }, values: raw };
  const values = {
    ...rest,
    ...order.times,
    fromIdent: fromAirport.ident,
    toIdent: toAirport.ident,
  };
  try {
    const saved = await asUser(user.id, async (tx) => {
      if (legId) {
        return tx
          .update(flightLegs)
          .set(values)
          .where(and(eq(flightLegs.id, legId), eq(flightLegs.flightLogId, logId)))
          .returning({ id: flightLegs.id });
      }
      const [last] = await tx
        .select({ seq: sql<number>`coalesce(max(${flightLegs.seq}), 0)::int` })
        .from(flightLegs)
        .where(eq(flightLegs.flightLogId, logId));
      return tx
        .insert(flightLegs)
        .values({ ...values, flightLogId: logId, seq: (last?.seq ?? 0) + 1 })
        .returning({ id: flightLegs.id });
    });
    if (!saved.length) return { message: t("errors.not_editable"), values: raw };
  } catch (e) {
    const { code } = pgError(e);
    if (code === "42501") return { message: t("errors.not_editable"), values: raw };
    if (code === "23514") return { message: t("errors.leg_checks"), values: raw };
    throw e;
  }
  refresh(ctx.detail.booking.id);
  return { ok: true, message: t("legSaved") };
}

/** Remove a leg while the log is still editable. */
export async function deleteLeg(formData: FormData) {
  const user = await requireUser("/bookings");
  const legId = idSchema.parse(formData.get("legId"));
  const bookingId = idSchema.parse(formData.get("bookingId"));
  await asUser(user.id, (tx) => tx.delete(flightLegs).where(eq(flightLegs.id, legId)));
  refresh(bookingId);
}

/** Run one of the log's status functions and map its errors. */
async function statusChange(
  formData: FormData,
  run: (logId: string, raw: Record<string, string>) => ReturnType<typeof sql>,
): Promise<FormState> {
  const user = await requireUser("/bookings");
  sendNotificationsSoon();
  const t = await getTranslations("flightLog");
  const raw = formValues(formData);
  const logId = idSchema.safeParse(raw.logId);
  if (!logId.success) return { message: t("errors.not_found") };
  try {
    await asUser(user.id, (tx) => tx.execute(run(logId.data, raw)));
  } catch (e) {
    const { code, message } = pgError(e);
    const known = [
      "not_found",
      "not_editable",
      "no_legs",
      "not_submitted",
      "note_required",
      "bad_amount",
    ];
    if (code === "P0001") {
      return {
        message: t(
          `errors.${known.includes(message ?? "") ? message : "failed"}` as "errors.failed",
        ),
        values: raw,
      };
    }
    throw e;
  }
  refresh(raw.bookingId ?? "");
  return { ok: true };
}

/** Check-in: the pilot submits the log to the owner. */
export async function submitLog(_prev: FormState, formData: FormData) {
  return statusChange(formData, (logId) => sql`select public.submit_flight_log(${logId}::uuid)`);
}

/** The owner asks for a correction. */
export async function requestCorrection(_prev: FormState, formData: FormData) {
  return statusChange(
    formData,
    (logId, raw) => sql`select public.request_log_correction(${logId}::uuid, ${raw.note ?? ""})`,
  );
}

/** The owner confirms: the flown time and amount due are worked out once more on the server. */
export async function confirmLog(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/bookings");
  const t = await getTranslations("flightLog");
  const raw = formValues(formData);
  const detail = await getBooking(user.id, raw.bookingId ?? "");
  const data = detail ? await getFlightLog(user.id, detail.booking.id) : null;
  if (!detail || !data) return { message: t("errors.not_found") };
  const zone = "UTC";
  const fuel = fuelSettlement(data.uplifts, detail.booking.priceBasis);
  const result = bookingAmount(detail.booking, detail.period, zone, data.legs, fuel.adjustment);
  if (!result) return { message: t("errors.missing_meters") };
  return statusChange(
    formData,
    (logId) =>
      sql`select public.confirm_flight_log(${logId}::uuid, ${result.minutes}, ${result.amount}, ${result.fuelAdjustment})`,
  );
}
