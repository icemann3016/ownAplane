"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  addClosure,
  addFrequency,
  addRunway,
  addService,
  type ProfileResult,
  removeItem,
  setHours,
  updateProfile,
  updateService,
} from "@/lib/airport-profile/ops";
import { WEEKDAYS } from "@/lib/airport-profile/catalog";
import { requireUser } from "@/lib/auth/session";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import {
  closureSchema,
  frequencySchema,
  hoursSchema,
  profileSchema,
  runwaySchema,
  serviceSchema,
} from "@/lib/validation/airport-profile";

// An airfield's profile (APT-1). The database lets only its managers change it (RLS).

const identOf = (formData: FormData) => String(formData.get("ident") ?? "").slice(0, 20);

function refresh(ident: string) {
  const code = encodeURIComponent(ident);
  revalidatePath(`/airports/manage/${code}`, "layout");
  revalidatePath(`/airports/${code}`);
  revalidatePath("/airports");
}

async function outcome(ident: string, result: ProfileResult, saved: string): Promise<FormState> {
  const t = await getTranslations("airports");
  if (!result.ok) return { message: t(`errors.${result.error}`) };
  refresh(ident);
  return { ok: true, message: t(saved as "profile.saved") };
}

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser("/airports/manage");
  const raw = formValues(formData);
  const parsed = profileSchema.safeParse({
    ...raw,
    pprRequired: formData.get("pprRequired") === "on",
  });
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const ident = identOf(formData);
  const result = await outcome(
    ident,
    await updateProfile(user.id, ident, parsed.data),
    "profile.saved",
  );
  return result.ok ? result : { ...result, values: raw };
}

export async function setHoursAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/airports/manage");
  const raw = formValues(formData);
  const hours = WEEKDAYS.flatMap((d) =>
    formData.get(`open-${d}`) === "on"
      ? [
          {
            weekday: d,
            opens: String(formData.get(`opens-${d}`)),
            closes: String(formData.get(`closes-${d}`)),
          },
        ]
      : [],
  );
  const parsed = hoursSchema.safeParse({ note: raw.note, hours });
  if (!parsed.success) {
    // Errors point at the day's fields ("hours.2.closes" → "closes-3").
    const errors = await localizedFieldErrors(parsed.error);
    const byDay: Record<string, string[] | undefined> = {};
    for (const [key, value] of Object.entries(errors)) {
      const match = /^hours\.(\d+)\.(opens|closes)$/.exec(key);
      byDay[match ? `${match[2]}-${hours[Number(match[1])]!.weekday}` : key] = value;
    }
    return { errors: byDay, values: raw };
  }
  const ident = identOf(formData);
  const result = await outcome(ident, await setHours(user.id, ident, parsed.data), "hours.saved");
  return result.ok ? result : { ...result, values: raw };
}

async function addWith<T>(
  formData: FormData,
  schema: z.ZodType<T>,
  extra: Record<string, unknown>,
  add: (userId: string, ident: string, input: T) => Promise<ProfileResult>,
  saved: string,
): Promise<FormState> {
  const user = await requireUser("/airports/manage");
  const raw = formValues(formData);
  const parsed = schema.safeParse({ ...raw, ...extra });
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const ident = identOf(formData);
  const result = await outcome(ident, await add(user.id, ident, parsed.data), saved);
  return result.ok ? result : { ...result, values: raw };
}

export async function addClosureAction(_prev: FormState, formData: FormData) {
  return addWith(formData, closureSchema, {}, addClosure, "hours.closureAdded");
}

export async function addRunwayAction(_prev: FormState, formData: FormData) {
  return addWith(
    formData,
    runwaySchema,
    { lighted: formData.get("lighted") === "on" },
    addRunway,
    "runways.runwayAdded",
  );
}

export async function addFrequencyAction(_prev: FormState, formData: FormData) {
  return addWith(formData, frequencySchema, {}, addFrequency, "runways.frequencyAdded");
}

export async function addServiceAction(_prev: FormState, formData: FormData) {
  return addWith(formData, serviceSchema, {}, addService, "catalog.added");
}

/** Save a changed service, then leave the form's edit mode. */
export async function updateServiceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { message: (await getTranslations("airports"))("errors.not_allowed") };
  const result = await addWith(
    formData,
    serviceSchema,
    {},
    (userId, ident, input) => updateService(userId, ident, id.data, input),
    "catalog.saved",
  );
  if (result.ok) {
    redirect(`/airports/manage/${encodeURIComponent(identOf(formData))}/services`);
  }
  return result;
}

const removeInput = z.object({
  ident: z.string().min(1).max(20),
  item: z.enum(["closure", "runway", "frequency", "service"]),
  id: z.uuid(),
});

export async function removeItemAction(formData: FormData) {
  const user = await requireUser("/airports/manage");
  const parsed = removeInput.safeParse(formValues(formData));
  if (!parsed.success) return;
  const { ident, item, id } = parsed.data;
  const result = await removeItem(user.id, ident, item, id);
  if (result.ok) refresh(ident);
}
