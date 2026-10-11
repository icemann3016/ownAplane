import Link from "next/link";
import { BookOpenIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { SubmitButton } from "@/components/forms/submit-button";
import type { LogbookExperience as Experience } from "@/lib/logbook/experience";
import { takeExperienceFromLogbook } from "./actions";

/** "From your logbook: …" with a button to use it as the experience (LOG-7). */
export async function LogbookExperience({ experience }: { experience: Experience | null }) {
  const t = await getTranslations("pilot.experience");
  if (!experience) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <BookOpenIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {t("logbookNone")}{" "}
          <Link href="/logbook" className="underline">
            {t("logbookLink")}
          </Link>
        </span>
      </p>
    );
  }
  return (
    <form
      action={takeExperienceFromLogbook}
      className="flex flex-wrap items-center gap-3 rounded-md bg-muted/50 p-3 text-sm"
    >
      <BookOpenIcon className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="flex-1">
        {t("fromLogbook", {
          total: experience.totalHours,
          pic: experience.picHours,
          recent: experience.last90DaysHours,
        })}
      </span>
      <SubmitButton size="sm" variant="outline">
        {t("useLogbook")}
      </SubmitButton>
    </form>
  );
}
