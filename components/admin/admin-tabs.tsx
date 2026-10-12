"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

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
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 border-b">
        {TABS.map(({ href, key }) => {
          const current = href === "/admin" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px flex border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                  current
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
