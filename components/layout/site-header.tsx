import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { avatarUrl } from "@/lib/avatar-url";
import { getCurrentProfile } from "@/lib/auth/session";
import { siteConfig } from "@/lib/site";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { MessagesLink } from "./messages-link";
import { NotificationBell } from "./notification-bell";
import { type AccountSummary, UserMenu } from "./user-menu";

export async function SiteHeader() {
  const t = await getTranslations("common.nav");
  const current = await getCurrentProfile();
  const account: AccountSummary | null = current
    ? {
        id: current.userId,
        name: current.profile.displayName,
        avatarUrl: avatarUrl(current.profile.avatarKey),
        isPilot: current.roles.includes("pilot"),
        isAdmin: current.roles.includes("admin"),
      }
    : null;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Logo />
        <nav aria-label={t("main")} className="hidden items-center gap-1 md:flex">
          {siteConfig.mainNav.map((item) => (
            <Button key={item.href} variant="ghost" size="sm" asChild>
              <Link href={item.href}>{t(item.key)}</Link>
            </Button>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {account ? (
            <>
              <MessagesLink userId={account.id} />
              <NotificationBell userId={account.id} />
              <UserMenu account={account} />
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">{t("logIn")}</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">{t("signUp")}</Link>
              </Button>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1 md:hidden">
          {account && <MessagesLink userId={account.id} />}
          {account && <NotificationBell userId={account.id} />}
          <MobileNav account={account} />
        </div>
      </div>
    </header>
  );
}
