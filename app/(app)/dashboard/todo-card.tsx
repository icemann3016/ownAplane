import Link from "next/link";
import { ChevronRightIcon, CircleCheckIcon, ListTodoIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Dashboard } from "@/lib/dashboard";
import { intlLocale, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type TodoItem = { key: string; href: string; text: string; urgent?: boolean };

/** Everything waiting for the user, most urgent first, each linking to where it's done. */
export async function TodoCard({
  todo,
  credentialItems,
}: {
  todo: Dashboard["todo"];
  /** Credential warnings (expired, expiring, rejected), already worded. */
  credentialItems: TodoItem[];
}) {
  const t = await getTranslations("dashboard.todo");
  const locale = (await getLocale()) as Locale;
  const day = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" });
  const reg = (b: { aircraft: { registration: string } }) => b.aircraft.registration;
  const items: TodoItem[] = [
    ...todo.requestsToAnswer.map((b) => ({
      key: `req-${b.id}`,
      href: `/bookings/${b.id}`,
      text: t("answerRequest", { registration: reg(b), date: day.format(b.expiresAt) }),
      urgent: true,
    })),
    ...todo.logsToFinish.map((b) => ({
      key: `fin-${b.id}`,
      href: `/bookings/${b.id}/log`,
      text: t("finishLog", { registration: reg(b) }),
      urgent: true,
    })),
    ...todo.logsToConfirm.map((b) => ({
      key: `conf-${b.id}`,
      href: `/bookings/${b.id}/log`,
      text: t("confirmLog", { registration: reg(b) }),
      urgent: true,
    })),
    ...todo.openDefects.map((d) => ({
      key: `defects-${d.aircraftId}`,
      href: `/owner/aircraft/${d.aircraftId}/defects`,
      text: t("openDefects", { count: d.count, registration: d.registration }),
      urgent: true,
    })),
    ...todo.docsExpiring.map((d) => ({
      key: `doc-${d.aircraftId}-${d.kind}`,
      href: `/owner/aircraft/${d.aircraftId}/documents`,
      text: t(`docExpiring.${d.kind}`, {
        registration: d.registration,
        date: day.format(new Date(`${d.expiresOn}T00:00:00Z`)),
      }),
      urgent: true,
    })),
    ...credentialItems,
    ...todo.reviewsDue.map((b) => ({
      key: `rev-${b.id}`,
      href: `/bookings/${b.id}#review`,
      text: t("writeReview", { registration: reg(b) }),
    })),
    ...(todo.unreadMessages
      ? [
          {
            key: "msg",
            href: "/messages",
            text: t("unreadMessages", { count: todo.unreadMessages }),
          },
        ]
      : []),
    ...(todo.unreadNotifications
      ? [
          {
            key: "notif",
            href: "/notifications",
            text: t("unreadNotifications", { count: todo.unreadNotifications }),
          },
        ]
      : []),
    ...(todo.docsPending
      ? [
          {
            key: "pending",
            href: "/owner/aircraft",
            text: t("docsPending", { count: todo.docsPending }),
          },
        ]
      : []),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <ListTodoIcon className="size-5 text-primary" aria-hidden /> {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheckIcon className="size-4 text-success" aria-hidden /> {t("none")}
          </p>
        ) : (
          <ul className="grid divide-y">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 text-sm hover:bg-accent"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      item.urgent ? "bg-warning" : "bg-primary",
                    )}
                    aria-hidden
                  />
                  <span className="flex-1">{item.text}</span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
