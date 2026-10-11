"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { completeTestCheckout } from "@/lib/billing/checkout";
import { isTestMode } from "@/lib/billing/provider";

const input = z.object({ id: z.uuid(), outcome: z.enum(["paid", "failed", "canceled"]) });

/** Test mode: the "payment" on the stand-in checkout page, then back to Plan & billing. */
export async function finishCheckout(formData: FormData) {
  const user = await requireUser("/account/billing");
  const parsed = input.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !isTestMode()) redirect("/account/billing?done=failed");
  const result = await completeTestCheckout(user.id, parsed.data.id, parsed.data.outcome);
  revalidatePath("/account/billing");
  if (result === "already_subscribed") redirect("/account/billing?done=already_subscribed");
  redirect(`/account/billing?done=${result ? `checkout_${result}` : "failed"}`);
}
