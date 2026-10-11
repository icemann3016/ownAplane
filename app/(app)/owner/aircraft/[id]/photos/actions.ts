"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  deletePhoto as removePhoto,
  reorderPhotos as storeOrder,
} from "@/lib/aircraft/manage-parts";
import { requireUser } from "@/lib/auth/session";

function refresh(aircraftId: string) {
  revalidatePath(`/owner/aircraft/${aircraftId}`, "layout");
  revalidatePath(`/aircraft/${aircraftId}`);
  revalidatePath("/owner/aircraft");
}

const orderSchema = z.object({
  aircraftId: z.uuid(),
  order: z.array(z.uuid()).min(1).max(20),
});

/** Save the photos' order (the first one is the cover). RLS limits it to the owner's photos. */
export async function reorderPhotos(aircraftId: string, order: string[]) {
  const user = await requireUser();
  const parsed = orderSchema.parse({ aircraftId, order });
  await storeOrder(user.id, parsed.aircraftId, parsed.order);
  refresh(parsed.aircraftId);
}

const deleteSchema = z.object({ aircraftId: z.uuid(), photoId: z.uuid() });

/**
 * Delete one photo of the user's aircraft (row and file). A listed aircraft keeps at least one
 * photo (LST-3).
 */
export async function deletePhoto(
  aircraftId: string,
  photoId: string,
): Promise<{ ok: boolean; error?: "lastPhoto" }> {
  const user = await requireUser();
  const parsed = deleteSchema.parse({ aircraftId, photoId });
  const outcome = await removePhoto(user.id, parsed.aircraftId, parsed.photoId);
  if (!outcome.ok && outcome.error === "last_photo") return { ok: false, error: "lastPhoto" };
  refresh(parsed.aircraftId);
  return { ok: true };
}
