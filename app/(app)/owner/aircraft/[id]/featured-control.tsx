"use client";

import { useActionState } from "react";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState } from "@/lib/forms";
import { toggleFeatured } from "./featured-actions";

/** Turn "Featured in search" on or off for a listed aircraft (SUB-10). */
export function FeaturedControl({ id, featured }: { id: string; featured: boolean }) {
  const t = useTranslations("aircraft.featured");
  const [state, action] = useActionState(toggleFeatured, initialFormState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="featured" value={featured ? "false" : "true"} />
      <FormMessage state={state} />
      <SubmitButton variant="outline" size="sm" className="justify-self-start">
        <SparklesIcon aria-hidden />
        {featured ? t("turnOff") : t("turnOn")}
      </SubmitButton>
    </form>
  );
}
