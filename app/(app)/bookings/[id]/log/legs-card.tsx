import type { ComponentProps } from "react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { zonedDay } from "@/lib/domain/time";
import { LegDialog } from "./leg-dialog";
import { LegList } from "./leg-list";

/** The rental's legs, with the button to add the next one (BKG-12). */
export async function LegsCard({
  list,
  from,
}: {
  list: ComponentProps<typeof LegList>;
  /** Where the next leg starts: the last leg's arrival. */
  from: ComponentProps<typeof LegDialog>["from"];
}) {
  const t = await getTranslations("flightLog");
  const { bookingId, logId, fuelUnit, oilUnit } = list;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle as="h2">{t("legs")}</CardTitle>
        {list.editable && list.legs.length < 50 && (
          <LegDialog
            bookingId={bookingId}
            logId={logId}
            fuelUnit={fuelUnit}
            oilUnit={oilUnit}
            from={from}
            to={null}
            values={{ date: zonedDay(new Date(), "UTC"), landings: "1" }}
          />
        )}
      </CardHeader>
      <CardContent>
        <LegList {...list} />
      </CardContent>
    </Card>
  );
}
