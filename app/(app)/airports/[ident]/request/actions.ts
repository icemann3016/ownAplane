"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { sendAirportRequest } from "@/lib/airport-requests/ops";
import { requireUser } from "@/lib/auth/session";
import { type FormState, formValues } from "@/lib/forms";
import { localizedFieldErrors } from "@/lib/i18n/server";
import { airportRequestSchema } from "@/lib/validation/airport-request";

/** Send a request to an airfield (APT-2/3), then open it. */
export async function sendRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ident = String(formData.get("ident") ?? "").slice(0, 20);
  const user = await requireUser(`/airports/${encodeURIComponent(ident)}/request`);
  const raw = formValues(formData);
  const services = formData.getAll("svc").map((id) => ({
    serviceId: String(id),
    quantity: Number(String(formData.get(`qty-${String(id)}`) ?? "1").replace(",", ".")),
  }));
  const parsed = airportRequestSchema.safeParse({
    ...raw,
    arriving: formData.get("arriving") === "on",
    departing: formData.get("departing") === "on",
    services,
  });
  if (!parsed.success) return { errors: await localizedFieldErrors(parsed.error), values: raw };
  const result = await sendAirportRequest(user.id, ident, parsed.data);
  if (!result.ok) {
    const t = await getTranslations("airportRequests.errors");
    return { message: t(result.error), values: raw };
  }
  revalidatePath("/airport-requests");
  redirect(`/airport-requests/${result.id}?sent=1`);
}
