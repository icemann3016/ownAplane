"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { getMyPlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/billing/plans";
import { deleteFeed, resetFeed } from "@/lib/calendar-sync/booking-feed";

/** Create or reset the private calendar link of the user's bookings (Pilot Plus). */
export async function resetBookingFeed() {
  const user = await requireUser("/bookings");
  if (!PLANS[(await getMyPlan(user.id)).plan].bookingsCalendar) return;
  await resetFeed(user.id);
  revalidatePath("/bookings");
}

export async function removeBookingFeed() {
  const user = await requireUser("/bookings");
  await deleteFeed(user.id);
  revalidatePath("/bookings");
}
