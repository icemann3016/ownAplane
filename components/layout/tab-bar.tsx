"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export type Tab = { href: string; label: ReactNode; current: boolean };

/**
 * A row of tabs without a visible scrollbar. When they don't fit, the row scrolls sideways
 * (swipe, trackpad, or the arrow on the faded edge that has more tabs), and the current tab is
 * scrolled into view.
 */
export function TabBar({ label, tabs }: { label: string; tabs: Tab[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const current = tabs.find((t) => t.current)?.href;

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setMore({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    const tab = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && tab) {
      const start = tab.offsetLeft;
      const end = start + tab.offsetWidth;
      if (start < el.scrollLeft || end > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = start - (el.clientWidth - tab.offsetWidth) / 2;
      }
    }
    update();
  }, [current, update]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  const scroll = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <nav aria-label={label} className="relative -mx-4 overflow-hidden">
      <div
        ref={scroller}
        onScroll={update}
        className="relative [scrollbar-width:none] overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex min-w-max gap-1 border-b">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={tab.current ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                  tab.current
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <Edge side="left" show={more.left} onClick={() => scroll(-1)} />
      <Edge side="right" show={more.right} onClick={() => scroll(1)} />
    </nav>
  );
}

/**
 * The fade over an edge with more tabs behind it, with an arrow for mouse users (keyboard users
 * tab through the links, which scrolls them into view; phones swipe).
 */
function Edge({
  side,
  show,
  onClick,
}: {
  side: "left" | "right";
  show: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("common");
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 flex w-14 items-center from-background via-background/90 to-transparent transition-opacity motion-reduce:transition-none",
        side === "left"
          ? "left-0 justify-start bg-gradient-to-r pl-1"
          : "right-0 justify-end bg-gradient-to-l pr-1",
        show ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={t(side === "left" ? "scrollLeft" : "scrollRight")}
        onClick={onClick}
        className={cn(
          "hidden size-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground sm:flex",
          show && "pointer-events-auto",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </button>
    </div>
  );
}
