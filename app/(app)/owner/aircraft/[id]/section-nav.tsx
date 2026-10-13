"use client";

import { usePathname } from "next/navigation";
import { CircleCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { TabBar } from "@/components/layout/tab-bar";
import { SECTIONS } from "@/lib/aircraft/catalog";

/** Tabs for the parts of a listing. `done` marks sections that are complete. */
export function SectionNav({ id, done }: { id: string; done: string[] }) {
  const t = useTranslations("aircraft.sections");
  const pathname = usePathname();
  const base = `/owner/aircraft/${id}`;
  const items = [
    { href: base, key: "overview" },
    { href: `${base}/calendar`, key: "calendar" },
    { href: `${base}/sync`, key: "sync" },
    ...SECTIONS.map((s) => ({ href: `${base}/${s}`, key: s })),
    { href: `${base}/defects`, key: "defects" },
    { href: `${base}/remarks`, key: "remarks" },
    { href: `${base}/usage`, key: "usage" },
  ];

  return (
    <TabBar
      label={t("label")}
      tabs={items.map(({ href, key }) => ({
        href,
        current: pathname === href,
        label: (
          <>
            {t(key as "overview")}
            {done.includes(key) && (
              <CircleCheckIcon className="size-3.5 text-success" aria-label={t("complete")} />
            )}
          </>
        ),
      }))}
    />
  );
}
