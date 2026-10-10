import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import type { Locale } from "@/lib/i18n/config";
import { knownType, listNotifications, markAllRead } from "@/lib/notifications";
import { formatUtc } from "@/lib/aircraft/format";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("title") };
}

/** The user's notifications, newest first; opening the page marks them read (BKG-9). */
export default async function NotificationsPage() {
  const user = await requireUser("/notifications");
  const t = await getTranslations("notifications");
  const locale = (await getLocale()) as Locale;
  const items = await listNotifications(user.id);
  await markAllRead(user.id);
  const format = (d: Date) => formatUtc(d, locale);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <Card>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            <ul className="grid divide-y">
              {items.map((n) => {
                const values = {
                  registration: n.booking?.registration ?? "",
                  when: n.booking ? format(n.booking.from) : "",
                  other: n.actor ?? t("someone"),
                  search: n.search?.name ?? "",
                };
                const text = t(`types.${knownType(n.type)}`, values);
                const href = n.search
                  ? `/search${n.search.query ? `?${n.search.query}` : ""}`
                  : n.bookingId
                    ? `/bookings/${n.bookingId}`
                    : "/bookings";
                return (
                  <li key={n.id}>
                    <Link
                      href={href}
                      className="-mx-2 grid gap-0.5 rounded-md px-2 py-3 hover:bg-accent"
                    >
                      <span className={cn("text-sm", !n.readAt && "font-semibold")}>
                        {!n.readAt && <span className="sr-only">{t("new")} </span>}
                        {text}
                      </span>
                      <span className="text-xs text-muted-foreground">{format(n.createdAt)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
