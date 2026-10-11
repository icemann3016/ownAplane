"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { setKnownItem as markRemark } from "@/lib/aircraft/owner-ops";
import { requireUser } from "@/lib/auth/session";

/** The aircraft's owner marks an aircraft remark as a known item, or as fixed. */
export async function setKnownItem(formData: FormData) {
  const user = await requireUser("/owner/aircraft");
  const remarkId = z.uuid().parse(formData.get("remarkId"));
  const state = z.enum(["known", "resolved"]).parse(formData.get("state"));
  await markRemark(user.id, remarkId, state);
  revalidatePath("/owner/aircraft", "layout");
  revalidatePath("/bookings", "layout");
}
