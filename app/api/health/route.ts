import { sql } from "drizzle-orm";

import journal from "@/db/migrations/meta/_journal.json";
import { getDb, isDatabaseConfigured } from "@/lib/db";

/**
 * Health check for load balancers and container platforms (Cloud Run, Azure Container Apps).
 * `migrations` shows whether the database has every migration this version was built with
 * (applied by scripts/migrate-on-deploy.mjs on Vercel, or npm run db:migrate).
 */
export async function GET() {
  let database: "ok" | "error" | "not_configured" = "not_configured";
  let applied: number | null = null;
  if (isDatabaseConfigured()) {
    try {
      await getDb().execute(sql`select 1`);
      database = "ok";
    } catch {
      database = "error";
    }
    // Informational only: a missing migrations table must not mark the app unhealthy.
    if (database === "ok") {
      try {
        const [row] = (await getDb().execute(
          sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
        )) as unknown as { n: number }[];
        applied = row?.n ?? 0;
      } catch {
        applied = null;
      }
    }
  }
  const expected = journal.entries.length;
  const ok = database !== "error";
  return Response.json(
    {
      status: ok ? "ok" : "error",
      database,
      migrations: { applied, expected, upToDate: applied === null ? null : applied >= expected },
    },
    { status: ok ? 200 : 503 },
  );
}
