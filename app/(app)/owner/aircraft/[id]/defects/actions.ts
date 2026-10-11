"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { groundAircraft as ground, resolveDefect as resolve } from "@/lib/aircraft/owner-ops";
import { requireUser } from "@/lib/auth/session";

/** The owner marks a defect as fixed, with an optional note (BKG-8). */
export async function resolveDefect(formData: FormData) {
  const user = await requireUser("/owner/aircraft");
  const defectId = z.uuid().parse(formData.get("defectId"));
  const aircraftId = z.uuid().parse(formData.get("aircraftId"));
  const note = String(formData.get("note") ?? "");
  await resolve(user.id, defectId, note);
  revalidatePath(`/owner/aircraft/${aircraftId}`, "layout");
}

/** Ground the aircraft: no bookings, acceptances or check-outs until it's listed again. */
export async function groundAircraft(formData: FormData) {
  const user = await requireUser("/owner/aircraft");
  const aircraftId = z.uuid().parse(formData.get("aircraftId"));
  await ground(user.id, aircraftId);
  revalidatePath("/owner/aircraft", "layout");
  revalidatePath("/bookings", "layout");
}
