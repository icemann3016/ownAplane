"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/account", key: "general" },
  { href: "/account/credentials", key: "credentials" },
  { href: "/account/billing", key: "billing" },
] as const;

/** Tabs of the account area: general settings, pilot credentials, plan & billing. */
export function AccountTabs() {
  const t = useTranslations("account.tabs");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 border-b">
        {TABS.map(({ href, key }) => {
          const current = pathname === href;
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
