import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** A short note that something comes with a bigger plan, linking to the plans. */
export async function PlanNote({ children }: { children: ReactNode }) {
  const t = await getTranslations("billing");
  return (
    <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
      {children}{" "}
      <Link
        href="/account/billing#plans"
        className="text-primary underline-offset-4 hover:underline"
      >
        {t("seePlans")}
      </Link>
    </p>
  );
}
