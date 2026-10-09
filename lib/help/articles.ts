import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

import { defaultLocale, type Locale } from "@/lib/i18n/config";
import { type Block, parseMarkdown, plainText } from "./markdown";

// The knowledge base: Markdown articles in content/help/<locale>/<slug>.md, one per topic, in
// this order and grouped by category. Update them together with the features they describe.
export const HELP_CATEGORIES = [
  { key: "start", slugs: ["getting-started", "account"] },
  { key: "pilots", slugs: ["pilot-credentials", "finding-and-booking", "flying-and-flight-log"] },
  { key: "owners", slugs: ["listing-an-aircraft", "owner-bookings-and-history", "calendar-sync"] },
  {
    key: "everyone",
    slugs: [
      "notifications",
      "messages",
      "reviews",
      "rules",
      "questions-and-answers",
      "coming-soon",
    ],
  },
  { key: "admins", slugs: ["admin-verification", "admin-moderation"] },
] as const;

export type HelpCategory = (typeof HELP_CATEGORIES)[number]["key"];
export const HELP_SLUGS: string[] = HELP_CATEGORIES.flatMap((c) => [...c.slugs]);

export type HelpArticle = {
  slug: string;
  category: HelpCategory;
  title: string;
  /** First paragraph, for the index and the page description. */
  summary: string;
  blocks: Block[];
  /** All text, lower case, for search. */
  searchText: string;
};

const dir = path.join(process.cwd(), "content", "help");

async function readArticle(locale: Locale, slug: string): Promise<string> {
  try {
    return await readFile(path.join(dir, locale, `${slug}.md`), "utf8");
  } catch {
    // A missing translation shows the English article rather than nothing.
    return readFile(path.join(dir, defaultLocale, `${slug}.md`), "utf8");
  }
}

/** One article, or null for an unknown slug. */
export const getHelpArticle = cache(
  async (locale: Locale, slug: string): Promise<HelpArticle | null> => {
    const category = HELP_CATEGORIES.find((c) => (c.slugs as readonly string[]).includes(slug));
    if (!category) return null;
    const blocks = parseMarkdown(await readArticle(locale, slug));
    const [first, ...rest] = blocks;
    const title = first?.type === "heading" ? first.text : slug;
    const body = first?.type === "heading" ? rest : blocks;
    const para = body.find((b) => b.type === "paragraph");
    const summary = para?.type === "paragraph" ? plainText(para.children) : "";
    const searchText = body
      .map((b) => {
        switch (b.type) {
          case "heading":
            return b.text;
          case "paragraph":
          case "quote":
            return plainText(b.children);
          case "list":
            return b.items.map(plainText).join(" ");
          case "table":
            return [...b.header, ...b.rows.flat()].map(plainText).join(" ");
          case "code":
            return b.text;
          default:
            return "";
        }
      })
      .join(" ")
      .toLowerCase();
    return {
      slug,
      category: category.key,
      title,
      summary,
      blocks: body,
      searchText: `${title.toLowerCase()} ${searchText}`,
    };
  },
);

export async function getHelpArticles(locale: Locale): Promise<HelpArticle[]> {
  const all = await Promise.all(HELP_SLUGS.map((slug) => getHelpArticle(locale, slug)));
  return all.filter((a): a is HelpArticle => a !== null);
}

/** Articles containing every word of the query (case-insensitive), in guide order. */
export function searchHelp(articles: HelpArticle[], query: string): HelpArticle[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return articles;
  return articles.filter((a) => words.every((w) => a.searchText.includes(w)));
}
