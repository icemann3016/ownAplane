"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { removePracticeData, startPracticeFlight } from "@/lib/admin/practice";
import { requireAdmin } from "@/lib/auth/session";

// Practice flights for admins: try the real check-out and check-in on the live site.

/** A fresh practice flight, then straight to its booking with the Check out button. */
export async function startPractice() {
  const { userId } = await requireAdmin("/admin/practice");
  const result = await startPracticeFlight(userId);
  if (!result.ok) redirect(`/admin/practice?error=${result.error}`);
  revalidatePath("/admin/practice");
  redirect(`/bookings/${result.bookingId}`);
}

export async function removePractice() {
  const { userId } = await requireAdmin("/admin/practice");
  await removePracticeData(userId);
  revalidatePath("/admin/practice");
  redirect("/admin/practice?removed=1");
}
