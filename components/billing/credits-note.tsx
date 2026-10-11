import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { creditStatus } from "@/lib/billing/credits";

/** "7 AI reads left · Get more" next to the places that read scans. */
export async function CreditsNote({ userId }: { userId: string }) {
  const t = await getTranslations("billing");
  const { available } = await creditStatus(userId);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <SparklesIcon className="size-4 text-primary" aria-hidden />
      <span>{t("note.left", { count: available })}</span>
      <Link
        href="/account/billing#credits"
        className="text-primary underline-offset-4 hover:underline"
      >
        {t("note.more")}
      </Link>
    </p>
  );
}
