import type { LogbookEntry } from "@/lib/db/schema";
import { sumEntries, type Totals } from "./totals";

// The EASA paper layout (LOG-5): pages of a fixed number of lines, each with the total of the
// page, the total from previous pages and the total to date. Totals brought forward open the
// first page; struck-through lines are printed but don't count. Pure.

export type LogbookPage = {
  n: number;
  rows: LogbookEntry[];
  thisPage: Totals;
  previous: Totals;
  toDate: Totals;
};

const counted = (e: LogbookEntry) => e.status === "certified";

export function paginate(entries: LogbookEntry[], linesPerPage = 14) {
  const opening = sumEntries(entries.filter((e) => e.kind === "brought_forward" && counted(e)));
  const lines = entries.filter((e) => e.kind !== "brought_forward");
  const pages: LogbookPage[] = [];
  let previous = opening;
  for (let i = 0; i < lines.length; i += linesPerPage) {
    const rows = lines.slice(i, i + linesPerPage);
    const thisPage = sumEntries(rows.filter(counted));
    const toDate = add(previous, thisPage);
    pages.push({ n: pages.length + 1, rows, thisPage, previous, toDate });
    previous = toDate;
  }
  return { opening, pages };
}

function add(a: Totals, b: Totals): Totals {
  return Object.fromEntries(
    Object.keys(a).map((k) => [k, a[k as keyof Totals] + b[k as keyof Totals]]),
  ) as Totals;
}
