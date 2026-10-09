import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { CopyField } from "@/components/copy-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSpan, formatUtc } from "@/lib/aircraft/format";
import type { ConnectionView } from "@/lib/calendar-sync/owner";
import type { Locale } from "@/lib/i18n/config";
import { appUrl } from "@/lib/site-url";
import { removeConnection, resetExportLink } from "./actions";
import { ConfirmAction, ReplaceKey, SyncNow } from "./connection-controls";

const FEED_ERRORS = new Set([
  "url_invalid",
  "address_blocked",
  "unreachable",
  "http_error",
  "too_large",
  "ical_invalid",
  "json_invalid",
]);

/** One connected system: status, conflicts, our iCal link for it, and its controls. */
export async function ConnectionCard({ c }: { c: ConnectionView }) {
  const t = await getTranslations("calendarSync");
  const locale = (await getLocale()) as Locale;
  const ids = { aircraftId: c.aircraftId, id: c.id };
  const pull = c.inbound === "ical" || c.inbound === "json";
  const when = c.lastSyncAt ? formatUtc(c.lastSyncAt, locale) : "";
  const reason = c.lastSyncError
    ? t(
        `feedErrors.${FEED_ERRORS.has(c.lastSyncError) ? c.lastSyncError : "failed"}` as "feedErrors.failed",
      )
    : "";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <CardTitle as="h3" className="text-base">
          {c.name}
        </CardTitle>
        <Badge variant="outline">{t(`kinds.${c.inbound}.label`)}</Badge>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm">
          {pull &&
            (!c.lastSyncAt
              ? t("status.never")
              : c.lastSyncError
                ? t("status.error", { when, reason })
                : t("status.ok", { when, count: c.lastSyncCount ?? 0 }))}
          {c.inbound === "push" && t("status.push", { count: c.busy })}
          {c.inbound === "none" && t("status.none")}
        </p>
        {pull && c.feedUrl && (
          <p className="text-sm break-all text-muted-foreground">
            {t("add.linkIs")} {c.feedUrl}
          </p>
        )}

        {c.conflicts.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>
              <p className="font-medium">{t("conflicts.title", { name: c.name })}</p>
              <ul className="list-disc pl-5">
                {c.conflicts.map((x) => (
                  <li key={x.id}>
                    {formatSpan(x.from, x.to, locale)}
                    {x.bookingId && (
                      <>
                        {" · "}
                        <Link href={`/bookings/${x.bookingId}`} className="underline">
                          {t("conflicts.openBooking")}
                        </Link>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <p>{t("conflicts.text")}</p>
            </AlertDescription>
          </Alert>
        )}

        <CopyField
          label={t("exportLink.label")}
          value={`${appUrl()}/api/v1/calendars/${c.exportToken}.ics`}
          hint={t("exportLink.hint")}
        />

        {c.inbound === "push" && (
          <div className="grid gap-2">
            <p className="text-sm">
              {t("apiKey.current", { hint: c.apiKeyHint ?? "" })}{" "}
              <Link href="/help/calendar-sync" className="underline">
                {t("apiKey.docs")}
              </Link>
            </p>
            <ReplaceKey {...ids} />
          </div>
        )}

        <div className="flex flex-wrap items-start gap-2">
          {pull && <SyncNow {...ids} />}
          <ConfirmAction
            ids={ids}
            action={resetExportLink}
            button={t("exportLink.reset")}
            title={t("exportLink.resetTitle")}
            text={t("exportLink.resetText")}
            confirm={t("exportLink.reset")}
          />
          <ConfirmAction
            ids={ids}
            action={removeConnection}
            button={t("remove.button")}
            title={t("remove.title", { name: c.name })}
            text={t("remove.text")}
            confirm={t("remove.button")}
            destructive
          />
        </div>
      </CardContent>
    </Card>
  );
}
