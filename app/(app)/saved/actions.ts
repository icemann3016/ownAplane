"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { formValues } from "@/lib/forms";
import { setFavourite } from "@/lib/saved/favourites";
import { deleteSavedSearch, setSearchAlerts } from "@/lib/saved/searches";

// Favourites and saved searches (SRC-6); the lib functions only touch the user's own (RLS).

export async function removeFavourite(formData: FormData) {
  const user = await requireUser("/saved");
  const id = z.uuid().safeParse(formData.get("aircraftId"));
  if (!id.success) return;
  await setFavourite(user.id, id.data, false);
  revalidatePath("/saved");
}

const alertsSchema = z.object({ id: z.uuid(), alerts: z.enum(["0", "1"]) });

export async function changeSearchAlerts(formData: FormData) {
  const user = await requireUser("/saved");
  const parsed = alertsSchema.safeParse(formValues(formData));
  if (!parsed.success) return;
  await setSearchAlerts(user.id, parsed.data.id, parsed.data.alerts === "1");
  revalidatePath("/saved");
}

export async function removeSavedSearch(formData: FormData) {
  const user = await requireUser("/saved");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await deleteSavedSearch(user.id, id.data);
  revalidatePath("/saved");
}
