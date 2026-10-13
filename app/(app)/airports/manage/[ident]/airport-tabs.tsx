"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { TabBar } from "@/components/layout/tab-bar";

const TABS = ["", "/profile", "/hours", "/runways", "/fees"] as const;
const KEYS = {
  "": "team",
  "/profile": "profile",
  "/hours": "hours",
  "/runways": "runways",
  "/fees": "fees",
} as const;

/** Tabs of an airfield's area for its team (APT-1). */
export function AirportTabs({ ident }: { ident: string }) {
  const t = useTranslations("airports.tabs");
  const pathname = usePathname();
  const base = `/airports/manage/${encodeURIComponent(ident)}`;
  return (
    <TabBar
      label={t("label")}
      tabs={TABS.map((tab) => ({
        href: `${base}${tab}`,
        label: t(KEYS[tab]),
        current: decodeURIComponent(pathname) === decodeURIComponent(`${base}${tab}`),
      }))}
    />
  );
}
