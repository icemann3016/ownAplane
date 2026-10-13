import { CalendarCheckIcon, CheckIcon, PlaneIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { SubmitButton } from "@/components/forms/submit-button";
import type { AppRole } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { setRole } from "./actions";

const ROLES = [
  { role: "pilot", icon: PlaneIcon },
  { role: "owner", icon: CalendarCheckIcon },
] as const;

/**
 * Pilot and owner switches. Airfield accounts (on a team or claiming one) can't be pilots
 * (Zlati, 2026-10-13), so their pilot switch is replaced by a note.
 */
export async function RolesForm({
  roles,
  airportAccount,
}: {
  roles: AppRole[];
  airportAccount: boolean;
}) {
  const t = await getTranslations("account.roles");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ROLES.map(({ role, icon: Icon }) => {
        const active = roles.includes(role);
        const title = t(`${role}Title`);
        return (
          <form
            key={role}
            action={setRole}
            className={cn(
              "flex flex-col gap-3 rounded-lg border p-4",
              active && "border-primary/50 bg-accent/50",
            )}
          >
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="enable" value={active ? "false" : "true"} />
            <div className="flex items-center justify-between">
              <Icon className="size-5 text-primary" aria-hidden />
              {active && (
                <span className="flex items-center gap-1 text-xs font-medium text-primary">
                  <CheckIcon className="size-3.5" aria-hidden /> {t("on")}
                </span>
              )}
            </div>
            <div>
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">{t(`${role}Text`)}</p>
            </div>
            {role === "pilot" && airportAccount && !active ? (
              <p className="mt-auto text-sm text-muted-foreground">{t("pilotAirport")}</p>
            ) : (
              <SubmitButton
                size="sm"
                variant={active ? "outline" : "default"}
                className="mt-auto self-start"
                aria-label={
                  active
                    ? t("switchOffLabel", { role: title })
                    : t("switchOnLabel", { role: title })
                }
              >
                {active ? t("switchOff") : t("switchOn")}
              </SubmitButton>
            )}
          </form>
        );
      })}
    </div>
  );
}
