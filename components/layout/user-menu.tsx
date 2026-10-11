"use client";

import Link from "next/link";
import {
  BookOpenIcon,
  CalendarDaysIcon,
  CreditCardIcon,
  HeartIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  LogOutIcon,
  MessagesSquareIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { signOut } from "@/app/(auth)/actions";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AccountSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
  isPilot: boolean;
  isAdmin: boolean;
};

export function UserMenu({ account }: { account: AccountSummary }) {
  const t = useTranslations("common.nav");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={t("accountMenu")}
      >
        <UserAvatar name={account.name} url={account.avatarUrl} size={32} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{account.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboardIcon /> {t("dashboard")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/bookings">
            <CalendarDaysIcon /> {t("bookings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/logbook">
            <BookOpenIcon /> {t("logbook")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/saved">
            <HeartIcon /> {t("saved")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/messages">
            <MessagesSquareIcon /> {t("messages")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account">
            <SettingsIcon /> {t("account")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/billing">
            <CreditCardIcon /> {t("billing")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/u/${account.id}`}>
            <UserRoundIcon /> {t("publicProfile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/help">
            <LifeBuoyIcon /> {t("help")}
          </Link>
        </DropdownMenuItem>
        {account.isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin/verifications">
              <ShieldCheckIcon /> {t("admin")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOutIcon /> {t("logOut")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
