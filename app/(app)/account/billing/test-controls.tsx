import { FlaskConicalIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Subscription } from "@/lib/db/schema";
import { endPeriodNow, toggleFailNext } from "./actions";

/** Test mode: try what renewals and failed payments do without waiting for them. */
export async function TestControls({ sub }: { sub: Subscription }) {
  const t = await getTranslations("billing.account");
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <FlaskConicalIcon className="size-5" aria-hidden />
          {t("testTitle")}
        </CardTitle>
        <CardDescription>{t("testText")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-sm">
        <form action={toggleFailNext}>
          <input type="hidden" name="on" value={sub.testFailNext ? "false" : "true"} />
          <SubmitButton variant="outline" size="sm">
            {sub.testFailNext ? t("failNextOff") : t("failNextOn")}
          </SubmitButton>
        </form>
        {sub.status === "active" && (
          <form action={endPeriodNow}>
            <SubmitButton variant="outline" size="sm">
              {t("renewNow")}
            </SubmitButton>
          </form>
        )}
        {sub.testFailNext && <p className="text-muted-foreground">{t("failNextSet")}</p>}
      </CardContent>
    </Card>
  );
}
