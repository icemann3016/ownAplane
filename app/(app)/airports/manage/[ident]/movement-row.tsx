import Link from "next/link";
import { PlaneLandingIcon, PlaneTakeoffIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { RequestStatusBadge } from "@/components/airport-requests/status-badge";
import type { Movement } from "@/lib/airport-requests/queries";

const hhmm = (d: Date) => d.toISOString().slice(11, 16);

/** One arrival or departure on the board: when, who, what they need, where it stands. */
export async function MovementRow({
  movement,
  kind,
  at,
}: {
  movement: Movement;
  kind: "arrival" | "departure" | "ground";
  at: Date | null;
}) {
  const t = await getTranslations("airportRequests.board");
  const tc = await getTranslations("airports.catalog");
  const ta = await getTranslations("aircraft");
  const r = movement.request;
  const other = kind === "departure" ? movement.to : movement.from;
  const otherCode = other ? (other.icaoCode ?? other.ident) : null;
  const services = movement.items.map((i) =>
    i.fuelType
      ? `${ta(`fuelTypes.${i.fuelType}`)} ${i.quantity} L`
      : i.category === "other"
        ? (i.label ?? tc("categories.other"))
        : tc(`categories.${i.category}`),
  );
  const Icon = kind === "departure" ? PlaneTakeoffIcon : PlaneLandingIcon;
  return (
    <li>
      <Link
        href={`/airport-requests/${r.id}`}
        className="-mx-2 grid gap-1 rounded-md px-2 py-3 hover:bg-accent sm:grid-cols-[6rem_1fr_auto] sm:items-center sm:gap-3"
      >
        <span className="flex items-center gap-2 font-mono font-semibold">
          <Icon className="size-4 text-primary" aria-hidden />
          <span className="sr-only">{t(kind)}</span>
          {at ? `${hhmm(at)}Z` : "—"}
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="font-medium">
            {r.registration}
            {r.aircraftType && <span className="text-muted-foreground"> · {r.aircraftType}</span>}
            {otherCode && (
              <span className="text-muted-foreground">
                {" "}
                ·{" "}
                {kind === "departure"
                  ? t("to", { place: otherCode })
                  : t("from", { place: otherCode })}
              </span>
            )}
          </span>
          <span className="text-sm text-muted-foreground">
            {movement.pilot} · {t("pob", { count: r.pob })}
            {services.length > 0 && ` · ${services.join(", ")}`}
            {r.otherRequest && ` · ${t("otherAsked")}`}
          </span>
        </span>
        <span>
          <RequestStatusBadge request={r} />
        </span>
      </Link>
    </li>
  );
}
