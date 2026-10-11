import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ExternalLinkIcon, ShieldCheckIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUtc } from "@/lib/aircraft/format";
import { getMemberDetail } from "@/lib/admin/member-detail";
import { avatarUrl } from "@/lib/avatar-url";
import { requireAdmin } from "@/lib/auth/session";
import type { Locale } from "@/lib/i18n/config";
import { AccessCard } from "./access-card";
import { AccountCard } from "./account-card";
import { BillingCard } from "./billing-card";
import { BookingsCard, OwnerCard, PilotCard } from "./activity-cards";
import { HistoryCard } from "./history-card";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.member");
  return { title: t("metaTitle") };
}

/** One member for admins: account, activity, reports, history and access actions (ADM-2). */
export default async function AdminMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId: adminId } = await requireAdmin(`/admin/users/${id}`);
  if (!UUID.test(id)) notFound();
  const m = await getMemberDetail(id, adminId);
  if (!m) notFound();
  const t = await getTranslations("admin.member");
  const tu = await getTranslations("admin.users");
  const tp = await getTranslations("profile.roles");
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8">
      <Button variant="ghost" size="sm" className="justify-self-start" asChild>
        <Link href="/admin/users">
          <ArrowLeftIcon aria-hidden /> {t("back")}
        </Link>
      </Button>
      <header className="flex flex-wrap items-center gap-4">
        <UserAvatar name={m.name} url={avatarUrl(m.avatarKey)} size={64} />
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {m.name}
            {m.roles.map((r) => (
              <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>
                {r === "admin" ? tu("admin") : tp(r as "pilot" | "owner")}
              </Badge>
            ))}
            {m.suspendedAt && (
              <Badge variant="outline" className="border-destructive/50 text-destructive">
                {tu("suspended")}
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("memberSince", { date: formatUtc(m.createdAt, locale, { dateOnly: true }) })} ·{" "}
            {m.lastSeen
              ? t("lastActive", { date: formatUtc(new Date(m.lastSeen), locale) })
              : t("noSession")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/u/${m.id}`}>
              {t("publicProfile")} <ExternalLinkIcon aria-hidden />
            </Link>
          </Button>
          {m.credentialCount > 0 && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/verifications/${m.id}`}>
                <ShieldCheckIcon aria-hidden /> {t("reviewCredentials")}
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <AccessCard m={m} adminId={adminId} />
        <AccountCard m={m} />
        <BillingCard userId={m.id} />
        <PilotCard m={m} />
        <OwnerCard m={m} />
        <BookingsCard m={m} />
        <HistoryCard m={m} />
      </div>
    </div>
  );
}
