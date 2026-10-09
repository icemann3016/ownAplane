"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { SECTIONS } from "@/lib/aircraft/catalog";
import { cn } from "@/lib/utils";

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
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 border-b">
        {items.map(({ href, key }) => {
          const current = pathname === href;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                  current
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(key as "overview")}
                {done.includes(key) && (
                  <CircleCheckIcon className="size-3.5 text-success" aria-label={t("complete")} />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
