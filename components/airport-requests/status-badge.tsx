import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import type { AirportRequest } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const TONE = {
  pending: "border-warning/50 text-warning",
  approved: "border-success/50 text-success",
  confirmed: "border-success/50 text-success",
  declined: "border-destructive/50 text-destructive",
  cancelled: "text-muted-foreground",
} as const;

/** Where a request to an airfield stands; approved without PPR reads "Confirmed". */
export async function RequestStatusBadge({
  request,
}: {
  request: Pick<AirportRequest, "status" | "autoConfirmed">;
}) {
  const t = await getTranslations("airportRequests.statuses");
  const key = request.status === "approved" && request.autoConfirmed ? "confirmed" : request.status;
  return (
    <Badge variant="outline" className={cn(TONE[key])}>
      {t(key)}
    </Badge>
  );
}
