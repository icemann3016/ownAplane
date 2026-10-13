"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { TabBar } from "@/components/layout/tab-bar";

const TABS = [
  { href: "/account", key: "general" },
  { href: "/account/credentials", key: "credentials" },
  { href: "/account/billing", key: "billing" },
  { href: "/account/connections", key: "connections" },
] as const;

/** Tabs of the account area: general settings, pilot credentials, plan & billing, connected services. */
export function AccountTabs() {
  const t = useTranslations("account.tabs");
  const pathname = usePathname();
  return (
    <TabBar
      label={t("label")}
      tabs={TABS.map(({ href, key }) => ({ href, label: t(key), current: pathname === href }))}
    />
  );
}
