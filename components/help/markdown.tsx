import Link from "next/link";
import { Fragment } from "react";

import type { Block, Inline } from "@/lib/help/markdown";

function Inlines({ items }: { items: Inline[] }) {
  return items.map((item, i) => {
    switch (item.type) {
      case "text":
        return <Fragment key={i}>{item.text}</Fragment>;
      case "strong":
        return (
          <strong key={i} className="font-semibold">
            <Inlines items={item.children} />
          </strong>
        );
      case "em":
        return (
          <em key={i}>
            <Inlines items={item.children} />
          </em>
        );
      case "code":
        return (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
            {item.text}
          </code>
        );
      case "link": {
        const className = "font-medium text-primary underline underline-offset-4";
        return item.href.startsWith("/") || item.href.startsWith("#") ? (
          <Link key={i} href={item.href} className={className}>
            <Inlines items={item.children} />
          </Link>
        ) : (
          <a key={i} href={item.href} className={className} target="_blank" rel="noreferrer">
            <Inlines items={item.children} />
          </a>
        );
      }
    }
  });
}

/** A help article's blocks. The article's own title (h1) is rendered by the page. */
export function Markdown({ blocks }: { blocks: Block[] }) {
  return (
    <div className="grid gap-4 text-[15px] leading-7">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading": {
            const Tag = block.level === 3 ? "h3" : "h2";
            return (
              <Tag
                key={i}
                id={block.id}
                className={
                  block.level === 3
                    ? "mt-2 scroll-mt-20 text-base font-semibold"
                    : "mt-4 scroll-mt-20 text-xl font-semibold tracking-tight"
                }
              >
                <Inlines items={block.children} />
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={i}>
                <Inlines items={block.children} />
              </p>
            );
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag
                key={i}
                className={`grid gap-1.5 pl-6 ${block.ordered ? "list-decimal" : "list-disc"}`}
              >
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inlines items={item} />
                  </li>
                ))}
              </Tag>
            );
          }
          case "table":
            return (
              <div key={i} className="-mx-2 overflow-x-auto px-2">
                <table className="w-full min-w-[28rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      {block.header.map((cell, j) => (
                        <th key={j} scope="col" className="py-2 pr-4 font-semibold">
                          <Inlines items={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j} className="border-b align-top last:border-0">
                        {row.map((cell, k) => (
                          <td key={k} className="py-2 pr-4">
                            <Inlines items={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="border-l-4 border-primary/40 pl-4 text-muted-foreground"
              >
                <Inlines items={block.children} />
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={i}
                className="rounded-md bg-muted p-3 text-sm break-all whitespace-pre-wrap"
              >
                <code>{block.text}</code>
              </pre>
            );
          case "rule":
            return <hr key={i} className="my-2" />;
        }
      })}
    </div>
  );
}
