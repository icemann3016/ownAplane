"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { pgError } from "@/lib/aircraft/manage";
import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db/rls";
import { userRoles } from "@/lib/db/schema";

const choice = z.enum(["pilot", "owner", "both", "airfield"]);

/**
 * First step after sign-up: pilot, owner or both (can be changed any time in Account), or an
 * airfield, which goes on to claiming it. Airfield accounts can't be pilots (Zlati, 2026-10-13).
 */
export async function chooseRoles(formData: FormData) {
  const user = await requireUser("/welcome");
  const picked = choice.safeParse(formData.get("choice"));
  if (!picked.success) redirect("/welcome?step=roles");
  if (picked.data === "airfield") redirect("/airports/manage");
  const wanted = picked.data === "both" ? (["pilot", "owner"] as const) : [picked.data];
  const unwanted = (["pilot", "owner"] as const).filter(
    (r) => !(wanted as readonly string[]).includes(r),
  );
  try {
    await asUser(user.id, async (tx) => {
      for (const role of wanted) {
        await tx.insert(userRoles).values({ userId: user.id, role }).onConflictDoNothing();
      }
      if (unwanted.length) {
        await tx
          .delete(userRoles)
          .where(and(eq(userRoles.userId, user.id), inArray(userRoles.role, unwanted)));
      }
    });
  } catch (e) {
    if (!pgError(e).message?.includes("operator_not_pilot")) throw e;
    redirect("/welcome?step=roles");
  }
  revalidatePath("/", "layout");
  redirect("/welcome");
}
