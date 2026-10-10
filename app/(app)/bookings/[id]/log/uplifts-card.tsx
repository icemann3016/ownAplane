import type { ComponentProps } from "react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpliftDialog } from "./uplift-dialog";
import { UpliftList } from "./uplift-list";

/** Fuel and oil added during the rental, with the button to add more (BKG-13, BKG-14). */
export async function UpliftsCard({
  list,
  airport,
}: {
  list: ComponentProps<typeof UpliftList>;
  /** Where new entries start: the last leg's arrival. */
  airport: ComponentProps<typeof UpliftDialog>["airport"];
}) {
  const t = await getTranslations("flightLog");
  const {
    uplifts: _uplifts,
    airports: _airports,
    receipts: _receipts,
    units: _units,
    dipstick: _dipstick,
    editable,
    ...dialog
  } = list;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle as="h2">{t("uplifts")}</CardTitle>
        {editable && (
          <UpliftDialog
            {...dialog}
            airport={airport}
            receipt={null}
            values={{ kind: "fuel", fuelType: list.aircraftFuel, paidBy: "pilot" }}
          />
        )}
      </CardHeader>
      <CardContent>
        <UpliftList {...list} />
      </CardContent>
    </Card>
  );
}
