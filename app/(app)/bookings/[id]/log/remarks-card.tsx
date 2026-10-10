import { Trash2Icon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { PickerAirport } from "@/components/airport-picker";
import { KnownItemForm } from "@/components/bookings/known-item-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AirportSummary } from "@/lib/airports";
import type { FlightRemark } from "@/lib/db/schema";
import { deleteRemark } from "./remark-actions";
import { RemarkForm } from "./remark-form";

/** Remarks and PIREPs of this rental (BKG-15). */
export async function RemarksCard({
  bookingId,
  logId,
  remarks,
  airports,
  role,
  editable,
  defaultAirport,
}: {
  bookingId: string;
  logId: string;
  remarks: FlightRemark[];
  airports: Record<string, AirportSummary>;
  role: "pilot" | "owner";
  editable: boolean;
  defaultAirport: PickerAirport | null;
}) {
  const t = await getTranslations("flightLog.remarks");
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t(role === "pilot" ? "pilotHint" : "ownerHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {remarks.length ? (
          <ul className="grid gap-3">
            {remarks.map((r) => {
              const known = r.knownSince !== null;
              const resolved = r.resolvedAt !== null;
              return (
                <li key={r.id} className="grid gap-1 rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {t(`kinds.${r.kind}`)}
                      {r.airportIdent && (
                        <span className="text-muted-foreground">
                          {airports[r.airportIdent]?.code ?? r.airportIdent}
                        </span>
                      )}
                      {known && (
                        <Badge variant={resolved ? "secondary" : "outline"}>
                          {t(resolved ? "fixed" : "known")}
                        </Badge>
                      )}
                    </span>
                    {role === "owner" && r.kind === "aircraft" && (
                      <KnownItemForm remarkId={r.id} known={known} resolved={resolved} />
                    )}
                    {editable && !known && (
                      <form action={deleteRemark}>
                        <input type="hidden" name="remarkId" value={r.id} />
                        <input type="hidden" name="logId" value={logId} />
                        <input type="hidden" name="bookingId" value={bookingId} />
                        <Button variant="ghost" size="sm" aria-label={t("deleteLabel")}>
                          <Trash2Icon aria-hidden /> {t("delete")}
                        </Button>
                      </form>
                    )}
                  </div>
                  <p className="whitespace-pre-line">{r.body}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        )}
        {editable && remarks.length < 50 && (
          <RemarkForm bookingId={bookingId} logId={logId} airport={defaultAirport} />
        )}
      </CardContent>
    </Card>
  );
}
