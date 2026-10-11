"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { type ListingGap, nextSection, type Section } from "@/lib/aircraft/catalog";
import {
  type AircraftValues,
  createAircraft as insertAircraft,
  deleteAircraft as removeAircraft,
  setAircraftStatus as changeStatus,
  updateAircraft,
} from "@/lib/aircraft/manage";
import { getUnits } from "@/lib/aircraft/queries";
import { requireProfile, requireUser } from "@/lib/auth/session";
import type { Fail } from "@/lib/bookings/outcome";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import {
  baseSchema,
  detailsSchema,
  equipmentSchema,
  pricingSchema,
} from "@/lib/validation/aircraft";

const BASE = "/owner/aircraft";
const idSchema = z.uuid();

/** Friendly errors for database constraints the forms can run into. */
async function constraintErrors(fail: Fail): Promise<FormState["errors"]> {
  const v = await getTranslations("validation");
  if (fail.error === "registration_taken") return { registration: [v("registrationTaken")] };
  return { homeAirport: [v("airportUnknown")] };
}

function refresh(id: string) {
  revalidatePath(BASE);
  revalidatePath(`${BASE}/${id}`, "layout");
  revalidatePath(`/aircraft/${id}`);
}

/** Step 1 of a new listing: creates the draft and continues with the next section. */
export async function createAircraft(_prev: FormState, formData: FormData): Promise<FormState> {
  const { userId, roles } = await requireProfile(`${BASE}/new`);
  const t = await getTranslations("aircraft.edit");
  if (!roles.includes("owner")) return { message: t("ownerRoleNeeded") };
  const raw = formValues(formData);
  const parsed = detailsSchema(await getUnits(userId)).safeParse(raw);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };

  const created = await insertAircraft(userId, parsed.data);
  if (!created.ok) {
    if (created.error === "owner_role_needed") return { message: t("ownerRoleNeeded") };
    return { errors: await constraintErrors(created), values: raw };
  }
  revalidatePath(BASE);
  redirect(`${BASE}/${created.id}/${nextSection("details")}`);
}

type Values = AircraftValues;

/**
 * Save one section of the user's aircraft. Drafts continue with the next setup step; saved
 * changes to other aircraft stay on the page with a message.
 */
async function saveSection(
  section: Section,
  formData: FormData,
  parse: (raw: Record<string, string>, userId: string) => Promise<z.ZodSafeParseResult<Values>>,
): Promise<FormState> {
  const user = await requireUser(BASE);
  const t = await getTranslations("aircraft.edit");
  const raw = formValues(formData);
  const id = idSchema.safeParse(raw.id);
  if (!id.success) return { message: t("notFound") };
  const parsed = await parse(raw, user.id);
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };

  const saved = await updateAircraft(user.id, id.data, parsed.data);
  if (!saved.ok) {
    if (saved.error === "not_found") return { message: t("notFound") };
    return { errors: await constraintErrors(saved), values: raw };
  }
  const { status } = saved;
  refresh(id.data);
  const next = nextSection(section);
  if (status === "draft" && next) redirect(`${BASE}/${id.data}/${next}`);
  return { ok: true, message: t("saved"), values: raw };
}

export async function saveDetails(_prev: FormState, formData: FormData) {
  return saveSection("details", formData, async (raw, userId) =>
    detailsSchema(await getUnits(userId)).safeParse(raw),
  );
}

export async function saveEquipment(_prev: FormState, formData: FormData) {
  return saveSection("equipment", formData, async (raw) => equipmentSchema.safeParse(raw));
}

export async function saveBase(_prev: FormState, formData: FormData) {
  return saveSection("base", formData, async (raw) => baseSchema.safeParse(raw));
}

export async function savePricing(_prev: FormState, formData: FormData) {
  return saveSection("pricing", formData, async (raw) => pricingSchema.safeParse(raw));
}

const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["listed", "paused", "unlisted"]),
});

/** List, pause or unlist an aircraft (LST-7). The database checks it's ready to be listed. */
export async function setAircraftStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(BASE);
  const t = await getTranslations("aircraft.status");
  const parsed = statusSchema.safeParse(formValues(formData));
  if (!parsed.success) return { message: t("failed") };
  const { id, status } = parsed.data;

  const outcome = await changeStatus(user.id, id, status);
  if (!outcome.ok) {
    if (outcome.error === "not_ready") {
      const gaps = await getTranslations("aircraft.gaps");
      const missing = (outcome.missing ?? []).map((g) => gaps(g as ListingGap));
      return { message: t("notReady", { missing: missing.join(", ") }) };
    }
    if (outcome.error === "blocked") return { message: t("blocked") };
    if (outcome.error === "plan_limit")
      return { message: t("planLimit", { limit: outcome.limit ?? 1 }) };
    if (outcome.error === "registration_taken") return { message: t("registrationTaken") };
    return { message: t("failed") };
  }
  refresh(id);
  return { ok: true, message: t(`done.${status}`) };
}

/** Delete an aircraft with its photos and documents. */
export async function deleteAircraft(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(BASE);
  const id = idSchema.parse(formData.get("id"));
  const outcome = await removeAircraft(user.id, id);
  if (!outcome.ok && outcome.error === "has_bookings") {
    const t = await getTranslations("aircraft.delete");
    return { message: t("hasBookings") };
  }
  revalidatePath(BASE);
  redirect(BASE);
}
