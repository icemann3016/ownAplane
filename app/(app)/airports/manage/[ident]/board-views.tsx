"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { BOARD_VIEWS, type BoardView } from "@/lib/airport-requests/board";
import { cn } from "@/lib/utils";

/** Day / week / month; the choice is remembered for next time (a cookie for this page only). */
export function BoardViews({ base, view, day }: { base: string; view: BoardView; day: string }) {
  const t = useTranslations("airportRequests.board");
  return (
    <nav aria-label={t("viewLabel")} className="inline-flex rounded-md border p-0.5">
      {BOARD_VIEWS.map((v) => (
        <Link
          key={v}
          href={`${base}?view=${v}&day=${day}`}
          aria-current={v === view ? "page" : undefined}
          onClick={() => {
            document.cookie = `airport-board-view=${v}; path=/airports/manage; max-age=31536000; samesite=lax`;
          }}
          className={cn(
            "rounded px-3 py-1 text-sm",
            v === view ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          )}
        >
          {t(`views.${v}`)}
        </Link>
      ))}
    </nav>
  );
}
