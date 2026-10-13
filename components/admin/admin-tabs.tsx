"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { TabBar } from "@/components/layout/tab-bar";

const TABS = [
  { href: "/admin", key: "dashboard" },
  { href: "/admin/verifications", key: "verifications" },
  { href: "/admin/reports", key: "reports" },
  { href: "/admin/users", key: "users" },
  { href: "/admin/aircraft", key: "aircraft" },
  { href: "/admin/audit", key: "audit" },
  { href: "/admin/api", key: "api" },
  { href: "/admin/billing", key: "billing" },
  { href: "/admin/practice", key: "practice" },
] as const;

/** Tabs of the admin area (ADM-1…4). */
export function AdminTabs() {
  const t = useTranslations("admin.tabs");
  const pathname = usePathname();
  return (
    <TabBar
      label={t("label")}
      tabs={TABS.map(({ href, key }) => ({
        href,
        label: t(key),
        current: href === "/admin" ? pathname === href : pathname.startsWith(href),
      }))}
    />
  );
}
