import Link from "next/link";
import { TowerControlIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requestableAirfields } from "@/lib/airport-requests/prefill";

/**
 * The trip's airfields that take requests on ownAplane (APT-7): one link each to a request filled
 * in from this booking. Nothing when none of them is on ownAplane.
 */
export async function AirfieldRequests({
  userId,
  bookingId,
  route,
}: {
  userId: string;
  bookingId: string;
  route: { ident: string; code: string; name: string }[];
}) {
  const on = await requestableAirfields(
    userId,
    route.map((r) => r.ident),
  );
  if (!on.length) return null;
  const t = await getTranslations("airportRequests.booking");
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <TowerControlIcon className="size-5 text-primary" aria-hidden /> {t("title")}
        </CardTitle>
        <CardDescription>{t("text")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 text-sm">
          {on.map((ident) => {
            const airfield = route.find((r) => r.ident === ident)!;
            return (
              <li key={ident}>
                <Link
                  href={`/airports/${encodeURIComponent(ident)}/request?booking=${bookingId}`}
                  className="underline underline-offset-4"
                >
                  {t("send", { airport: `${airfield.code} ${airfield.name}` })}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
