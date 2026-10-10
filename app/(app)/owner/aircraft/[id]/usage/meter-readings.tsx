import { Trash2Icon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUtc } from "@/lib/aircraft/format";
import { getMeterReadings } from "@/lib/aircraft/meter-readings";
import type { Locale } from "@/lib/i18n/config";
import { deleteMeterReading } from "./meter-actions";
import { MeterReadingForm } from "./meter-reading-form";

/**
 * Meter readings between rentals (BKG-7): after flying outside ownAplane, maintenance or a meter
 * change, the next rental's check-out is compared with the latest one.
 */
export async function MeterReadings({
  userId,
  aircraftId,
}: {
  userId: string;
  aircraftId: string;
}) {
  const t = await getTranslations("usage.meters");
  const locale = (await getLocale()) as Locale;
  const readings = await getMeterReadings(userId, aircraftId);
  const now = new Date().toISOString().slice(0, 16);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("text")}</p>
      </CardHeader>
      <CardContent className="grid gap-6">
        <MeterReadingForm aircraftId={aircraftId} now={now} />
        {readings.length > 0 && (
          <ul className="grid divide-y">
            {readings.map((r) => {
              const when = formatUtc(r.readAt, locale);
              return (
                <li key={r.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
                    <span className="font-medium">{when}</span>
                    <span>
                      {[
                        r.hobbs !== null && `${t("hobbs")} ${r.hobbs}`,
                        r.tach !== null && `${t("tach")} ${r.tach}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {r.note && <span className="break-words text-muted-foreground">{r.note}</span>}
                  </div>
                  <form action={deleteMeterReading}>
                    <input type="hidden" name="aircraftId" value={aircraftId} />
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      aria-label={t("remove", { when })}
                    >
                      <Trash2Icon aria-hidden />
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
