import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@/lib/site";
import { LanguageSwitcher } from "./language-switcher";

export async function SiteFooter() {
  const t = await getTranslations("common");
  return (
    <footer className="border-t print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {siteConfig.name}. {t("footer.tagline")}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <nav aria-label={t("nav.footer")} className="flex gap-4">
            {siteConfig.footerNav.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-foreground">
                {t(`footer.${item.key}`)}
              </Link>
            ))}
          </nav>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}
