// Applies database migrations during Vercel *production* deploys, before `next build`, so new code
// never goes live without its schema changes. If a migration fails, the build fails and the
// previous version stays live. Preview deploys, CI and Docker builds skip this.
// Needs DATABASE_URL_MIGRATIONS (Supabase Session pooler, port 5432): the app's DATABASE_URL is a
// transaction pooler, which isn't suitable for migrations. Without it, this only prints a warning.
import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log("[migrate] Not a Vercel production deploy: skipping database migrations.");
  process.exit(0);
}
if (!process.env.DATABASE_URL_MIGRATIONS) {
  console.warn(
    "[migrate] DATABASE_URL_MIGRATIONS is not set: migrations were NOT applied. " +
      "Add it in Vercel → Settings → Environment Variables (Production), or run npm run db:migrate.",
  );
  process.exit(0);
}
console.log("[migrate] Applying database migrations…");
const result = spawnSync("npx", ["drizzle-kit", "migrate"], { stdio: "inherit" });
process.exit(result.status ?? 1);
