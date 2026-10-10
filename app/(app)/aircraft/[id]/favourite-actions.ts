"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { formValues } from "@/lib/forms";
import { setFavourite } from "@/lib/saved/favourites";

const schema = z.object({ aircraftId: z.uuid(), favourite: z.enum(["0", "1"]) });

/** Add the aircraft to the user's favourites, or remove it (SRC-6). */
export async function toggleFavourite(formData: FormData) {
  const parsed = schema.safeParse(formValues(formData));
  if (!parsed.success) return;
  const { aircraftId, favourite } = parsed.data;
  const user = await requireUser(`/aircraft/${aircraftId}`);
  await setFavourite(user.id, aircraftId, favourite === "1");
  revalidatePath(`/aircraft/${aircraftId}`);
  revalidatePath("/saved");
}
