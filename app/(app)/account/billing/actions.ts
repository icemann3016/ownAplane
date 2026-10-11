"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { startCheckout } from "@/lib/billing/checkout";
import { CREDIT_PACKS } from "@/lib/billing/plans";
import { isTestMode } from "@/lib/billing/provider";
import { getSubscription } from "@/lib/billing/subscriptions";
import { renewNow, retryPayment } from "@/lib/billing/test-renewals";
import { changePlan, resumeSubscription, setTestFailNext } from "@/lib/billing/test-subscription";

// Plan & billing (SUB-4): choosing, changing and cancelling a plan, buying AI credits, and the
// test-mode controls. Each action ends on the billing page with what happened (?done=…).

const PAGE = "/account/billing";

function back(done: string): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?done=${done}`);
}

const planInput = z.object({
  plan: z.enum(["free", "pilot", "owner", "fleet"]),
  interval: z.enum(["month", "year"]).default("month"),
});

/** Choose a plan: a checkout without a subscription, else a change (or Free = cancel). */
export async function choosePlan(formData: FormData) {
  const user = await requireUser(PAGE);
  const parsed = planInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("failed");
  const { plan, interval } = parsed.data;
  const current = await getSubscription(user.id);
  if (!current) {
    if (plan === "free") back("kept");
    const started = await startCheckout(user.id, { type: "plan", plan, interval });
    if (!started.ok) back(started.error);
    redirect(started.url);
  }
  const { result } = await changePlan(user.id, plan === "free" ? "free" : { plan, interval });
  back(result);
}

const packInput = z.object({ pack: z.enum(Object.keys(CREDIT_PACKS) as [string, ...string[]]) });

export async function buyCredits(formData: FormData) {
  const user = await requireUser(PAGE);
  const parsed = packInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("failed");
  const started = await startCheckout(user.id, { type: "credits", pack: parsed.data.pack });
  if (!started.ok) back(started.error);
  redirect(started.url);
}

export async function resumePlan() {
  const user = await requireUser(PAGE);
  back(await resumeSubscription(user.id));
}

export async function payNow() {
  const user = await requireUser(PAGE);
  back(await retryPayment(user.id));
}

/** Test mode only: make the next payment fail, or let payments go through again. */
export async function toggleFailNext(formData: FormData) {
  const user = await requireUser(PAGE);
  if (!isTestMode()) back("not_available");
  const on = formData.get("on") === "true";
  await setTestFailNext(user.id, on);
  back(on ? "fail_next_on" : "fail_next_off");
}

/** Test mode only: act as if the billing period ended now (renewal, or the end). */
export async function endPeriodNow() {
  const user = await requireUser(PAGE);
  if (!isTestMode()) back("not_available");
  back((await renewNow(user.id)) ?? "no_subscription");
}
