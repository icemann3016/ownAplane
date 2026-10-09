# Deployment & moving clouds

The app is built so it can run on **any cloud**. It needs four things, and each one is plain,
standard technology chosen through environment variables:

| Piece | What it is | Today (dev) | Google Cloud | Azure |
|-------|-----------|-------------|--------------|-------|
| **Web app** | Next.js server, packaged by the `Dockerfile` | Vercel | Cloud Run | Container Apps (or App Service) |
| **Database** | PostgreSQL 14+ (`DATABASE_URL`) | Supabase Postgres | Cloud SQL for PostgreSQL | Azure Database for PostgreSQL (Flexible Server) |
| **Files** | Public photo storage (`STORAGE_DRIVER`) | Supabase Storage (`s3`) | Cloud Storage (`s3` interoperability) | Blob Storage (`azure`) |
| **Email** | SMTP (`EMAIL_DRIVER=smtp`) | printed to terminal (`console`) | any SMTP (Resend, SendGrid…) | Azure Communication Services Email (SMTP) |

Login (Better Auth) and the access rules (Row Level Security) live **inside our own database and
code**, so nothing about users or security is tied to a provider.

> Tip: pick one EU region for everything (e.g. Frankfurt: Google `europe-west3`, Azure `Germany West Central`).

---

## 1. The pieces in detail

### Web app
- `docker build -t ownaplane .` builds a production image that listens on `$PORT` (default 8080).
- `docker build --target migrate -t ownaplane-migrate .` builds a small image that runs the database
  migrations and exits. Run it as a one-off **job** before each release.
- Health check: `GET /api/health` returns `{"status":"ok","database":"ok"}`.
- Set `STORAGE_PUBLIC_BASE_URL` as a **build argument** too (`--build-arg STORAGE_PUBLIC_BASE_URL=…`),
  because Next.js reads it at build time to allow images from that host.

### Database
- Schema changes live in `db/migrations/` and are applied with `npm run db:migrate` (or the migrate image).
  On Vercel, production deploys apply them automatically before the build (`npm run vercel-build` →
  `scripts/migrate-on-deploy.mjs`, needs `DATABASE_URL_MIGRATIONS`); a failed migration stops the deploy.
- The app logs in as one database user and switches to the restricted role **`app_user`** for every
  user request (`lib/db/rls.ts`), so the RLS policies apply. The first migration creates `app_user` and
  grants it to the user running the migration. **If the app logs in as a different user than the one
  that ran migrations**, run once: `GRANT app_user TO <app_login_user>;`
- Connection poolers are fine (the driver uses `prepare: false`). Use a pooled URL for the app and,
  if the pooler is in *transaction* mode, a direct/session URL in `DATABASE_URL_MIGRATIONS`.
- Extensions: only `btree_gist` (M5, no double bookings), created by migration
  `0010_calendar_security.sql`. It ships with PostgreSQL; Supabase and Cloud SQL allow it by default,
  on **Azure** add it to the server parameter `azure.extensions` first. Radius search uses plain SQL
  (great-circle distance on latitude/longitude), so PostGIS isn't needed; scheduled jobs run through
  `/api/cron/daily`, so `pg_cron` isn't needed either.

### Airport data
- `npm run airports:import` downloads OurAirports (public domain) and upserts the European airfields
  into `airports`. Run it once per environment after the migrations, and again every few months to
  pick up changes. On Cloud Run / Azure run it as a one-off job from a machine with the repo, or
  from your laptop against the target `DATABASE_URL`.
- No database extensions are needed for airports (plain latitude/longitude columns).

### Files
- One public bucket/container named `media`. Keys look like `avatars/<user-id>/<timestamp>.jpg`.
- `STORAGE_DRIVER=s3` works with anything that speaks the S3 protocol; `azure` uses the Azure SDK.
  Only the environment variables change (see `.env.example`).
- A second, **private** bucket/container named `documents` holds licence and medical scans
  (keys `documents/<user-id>/<uuid>.pdf|jpg|png|webp`). Never make it public: the app reads files with
  its storage keys and serves them itself at `/api/documents/<id>` after checking that the viewer is
  the owner or an admin (admin views are logged). Set `S3_PRIVATE_BUCKET=documents` (s3 driver) or
  `AZURE_STORAGE_PRIVATE_CONTAINER=documents` (azure driver).
- Uploads are limited to 4 MB (Vercel's request limit); the browser shrinks large photos first.

### Admins
- Make someone an admin (they must have signed up): `npm run admin:grant -- someone@example.com`
  with that environment's `DATABASE_URL` in `.env.local`. Remove with `--revoke`.
- Admins see **Admin** in the account menu → verification queue at `/admin/verifications`.

### Scheduled jobs
- `GET /api/cron/daily` sends 30-day expiry reminders and removes uploads that were never attached.
  It only runs with the header `Authorization: Bearer $CRON_SECRET` (without `CRON_SECRET` it refuses).
- **Vercel:** `vercel.json` schedules it every day at 06:00 UTC. Set `CRON_SECRET` in the project's
  environment variables and Vercel sends the header automatically. (The Hobby plan allows daily jobs;
  more frequent jobs later in the plan need Pro or one of the schedulers below.)
- **Google Cloud:** Cloud Scheduler → HTTP job, `GET https://<site>/api/cron/daily`, header
  `Authorization: Bearer <secret>`.
- **Azure:** a scheduled Container Apps job (or Logic App) that runs
  `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/daily`.
- `GET /api/cron/sync` reads linked calendars of other booking systems (SYN-2) every 15 minutes,
  same header. Vercel Hobby can't run it that often, so `.github/workflows/calendar-sync.yml` calls
  it: add the **GitHub repository secret `CRON_SECRET`** (Settings → Secrets and variables →
  Actions) with the same value as on Vercel; without it the workflow does nothing. On Google Cloud
  / Azure, schedule it like the daily job, every 15 minutes.

### Google sign-in (optional)
1. Google Cloud Console → create a project → **APIs & Services → OAuth consent screen** (External, app name, support email).
2. **Credentials → Create credentials → OAuth client ID → Web application.**
3. **Authorized redirect URIs:** `<site-url>/api/auth/callback/google` for every address the app runs on, e.g.
   `http://localhost:3000/api/auth/callback/google` and `https://ownaplane.eu/api/auth/callback/google`.
4. Put the client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. The "Continue with Google" button appears automatically.
5. People who already have an email/password account connect Google from **Account → Security** while logged in (automatic linking is refused for unverified emails, on purpose).

### Apple sign-in (optional)
Needs a paid Apple Developer account (99 USD/year). Sign in with Apple doesn't work on `localhost`: test on ownaplane.eu.
1. [developer.apple.com](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles → Identifiers → +** → **App IDs** → App, e.g. `eu.ownaplane.app`, tick **Sign in with Apple**. Note your **Team ID** (top right).
2. **Identifiers → + → Services IDs**, e.g. `eu.ownaplane.signin` (this is `APPLE_CLIENT_ID`). Open it, tick **Sign in with Apple → Configure**: primary App ID from step 1, **Domains** `ownaplane.eu`, **Return URLs** `https://ownaplane.eu/api/auth/callback/apple`.
3. **Keys → +**, tick **Sign in with Apple** (configure → the App ID), download the `.p8` file (only once!) and note the **Key ID**.
4. Set `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` (the whole `.p8` file, including the `BEGIN`/`END` lines). The app makes Apple's client secret from the key itself and renews it, so nothing expires every 6 months.
5. People can hide their email ("Hide My Email"): we then get an `@privaterelay.appleid.com` address. For our emails to reach them, register the sending domain/address in **Services → Sign in with Apple for Email Communication** once real email (SMTP) is set up.

### Facebook sign-in (optional)
1. [developers.facebook.com](https://developers.facebook.com/apps) → **Create app** → use case **Authenticate and request data from users with Facebook Login**.
2. **Facebook Login → Settings → Valid OAuth Redirect URIs:** `https://ownaplane.eu/api/auth/callback/facebook` (and `http://localhost:3000/api/auth/callback/facebook`; localhost works while the app is in development mode).
3. **Use cases → Customise → Permissions:** make sure `email` and `public_profile` are added.
4. **App settings → Basic:** copy the **App ID** and **App secret** into `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`; add the privacy policy URL `https://ownaplane.eu/privacy`, terms `https://ownaplane.eu/terms` and the data-deletion instructions URL `https://ownaplane.eu/help/account`, then switch the app to **Live**.
5. Some Facebook accounts have no email (made with a phone number) or people decline sharing it; they're told to sign up with their email instead.

All three work the same way: the button appears once the keys are set, new accounts go to the setup guide, and existing accounts connect a provider from **Account → Security**.

### Email
- `EMAIL_DRIVER=smtp` + `SMTP_*` + `EMAIL_FROM`. Every major provider offers SMTP.
- Once real email works, set `AUTH_REQUIRE_EMAIL_VERIFICATION=true`.

### Monitoring (optional)
- **Errors**: `SENTRY_DSN` of any Sentry-compatible service (Sentry with EU data region, or a
  self-hosted GlitchTip). Server errors (pages, routes, Server Actions via `instrumentation.ts`)
  and browser errors (`app/error.tsx` → `/api/errors`) are sent without cookies, headers, query
  strings or user data. No SDK: `lib/monitoring` speaks the envelope API directly, so skip
  Sentry's setup wizard (`npx @sentry/wizard`); only the DSN is needed (Project Settings →
  Client Keys (DSN)). Check it with **Admin → Dashboard → Send a test error**.
- **Page statistics**: a cookie-less service, e.g. Plausible (`NEXT_PUBLIC_ANALYTICS_SRC=https://plausible.io/js/script.js`,
  `NEXT_PUBLIC_ANALYTICS_DOMAIN=ownaplane.eu`) or Umami (`…_SRC` + `…_WEBSITE_ID`). No cookie
  banner needed; the cookie policy already says so.

---

## 2. Today: Vercel + Supabase

Environment variables on Vercel (Project → Settings → Environment Variables):

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** URI (port 6543) |
| `DATABASE_URL_MIGRATIONS` | **Production only:** Supabase → Connect → **Session pooler** URI (port 5432), used to apply migrations on each production deploy |
| `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32` (different from your local one) |
| `BETTER_AUTH_URL` | `https://ownaplane.eu` (the Vercel *.vercel.app addresses are trusted automatically) |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Supabase → Storage → Settings → S3 Connection |
| `STORAGE_PUBLIC_BASE_URL` | `https://<project-ref>.supabase.co/storage/v1/object/public/media` |
| `S3_PRIVATE_BUCKET` | `documents` (Supabase → Storage → New bucket → **private**, i.e. "Public bucket" off) |
| `CRON_SECRET` | output of `openssl rand -base64 32` (for the daily job) |
| `EMAIL_DRIVER` | `console` for now |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional, see "Google sign-in" above |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | optional, see "Apple sign-in" above |
| `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | optional, see "Facebook sign-in" above |

Migrations run automatically on every production deploy (`vercel.json` → `npm run vercel-build`):
`scripts/migrate-on-deploy.mjs` applies them with `DATABASE_URL_MIGRATIONS` before `next build`, so
new code never goes live without its schema; if a migration fails, the deploy fails and the previous
version stays live. Preview deploys skip it. Without `DATABASE_URL_MIGRATIONS` it only warns, and
`npm run db:migrate` from your Mac (Session pooler URL in `.env.local`) still works.
| `SENTRY_DSN`, `NEXT_PUBLIC_ANALYTICS_*` | optional, see "Monitoring" above |

### Production checklist (KAN-72)

The live site (https://ownaplane.eu) runs on the Supabase project in Frankfurt. Before inviting
real owners:

1. **Separate databases**: keep the production Supabase project for ownaplane.eu only; use a
   second project (or `docker compose up -d db`) for development and Vercel preview deployments
   (Vercel → Settings → Environment Variables: set `DATABASE_URL` etc. per environment).
2. **Backups** (decision 2026-09-29: off on Supabase Free for now; set up managed backups when
   moving to Azure or Google Cloud). On Supabase: Database → Backups. The Pro plan keeps daily backups for 7 days;
   add **Point-in-Time Recovery** for the production project. Once a month, test a restore into
   the development project. Files: Storage has no backups of its own; copy the buckets with
   `rclone sync` (see §5) on a schedule, or accept that photos can be re-uploaded.
3. **Migrations first**: every push to main deploys and applies pending migrations before the
   build (needs `DATABASE_URL_MIGRATIONS` on Vercel Production; otherwise run `npm run db:migrate`
   against production **before** `git push origin main`).
4. **Secrets**: production `BETTER_AUTH_SECRET` and `CRON_SECRET` differ from development; only
   admins of the Vercel and Supabase projects can see them.
5. **Email**: real SMTP (e.g. Resend on ownaplane.eu, with SPF/DKIM), then
   `AUTH_REQUIRE_EMAIL_VERIFICATION=true`.
6. **Monitoring**: `SENTRY_DSN` and page statistics (above); Vercel → Settings → Cron Jobs shows
   whether the daily job runs.
7. **Health**: https://ownaplane.eu/api/health answers `{"status":"ok","database":"ok"}` when
   the app can reach the database (point an uptime monitor at it).
8. **Security**: go through `docs/security-review.md` once more.

---

## 3. Moving to Google Cloud (outline)

1. **Database:** create a Cloud SQL for PostgreSQL instance (same major version as Supabase, e.g. 17),
   a database `app` and a user. Connect Cloud Run to it (Cloud SQL connection or private IP).
2. **Files:** create a Cloud Storage bucket `media`, give `allUsers` the *Storage Object Viewer* role
   (public read), and create an **HMAC key** (Settings → Interoperability) for the `s3` driver:
   `S3_ENDPOINT=https://storage.googleapis.com`, `S3_REGION=auto`,
   `STORAGE_PUBLIC_BASE_URL=https://storage.googleapis.com/media`. Create a second bucket
   `documents` **without** public access and set `S3_PRIVATE_BUCKET=documents`.
3. **Image:** push the Docker image to Artifact Registry; create a **Cloud Run service** (port 8080,
   health check `/api/health`) and a **Cloud Run job** from the `migrate` target. Keep secrets in
   Secret Manager and expose them as environment variables.
4. Move the data (section 5), then switch DNS.

## 4. Moving to Azure (outline)

1. **Database:** create an Azure Database for PostgreSQL **Flexible Server** (same major version),
   a database `app`. Allow-list the extensions you use in `azure.extensions`.
2. **Files:** create a Storage Account and a container `media` with access level *Blob* (public read).
   Use `STORAGE_DRIVER=azure`, `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER=media`,
   `STORAGE_PUBLIC_BASE_URL=https://<account>.blob.core.windows.net/media`. Add a second container
   `documents` with access level *Private* and set `AZURE_STORAGE_PRIVATE_CONTAINER=documents`.
3. **Image:** push to Azure Container Registry; create a **Container App** (target port 8080, health
   probe `/api/health`) and a **Container Apps job** from the `migrate` target. Secrets from Key Vault.
4. **Email:** Azure Communication Services Email supports SMTP → `EMAIL_DRIVER=smtp`.
5. Move the data (section 5), then switch DNS.

---

## 5. Moving the data (any source → any target)

Rehearsed locally with `pg_dump`/`pg_restore`: data, RLS policies, triggers and the migration history
all come across, and later migrations continue normally.

```bash
# 0. Put the app in maintenance (or accept a short read-only window).

# 1. Target: enable the extensions you use, then create the runtime role:
psql "$TARGET_URL" -c "CREATE ROLE app_user NOLOGIN; GRANT app_user TO CURRENT_USER;"

# 2. Copy the database (our schemas only: public, app, drizzle)
pg_dump --format=custom --no-owner --schema=public --schema=app --schema=drizzle \
  "$SOURCE_URL" > app.dump
pg_restore --no-owner --dbname="$TARGET_URL" app.dump
#    "schema public already exists" and errors mentioning Supabase roles (anon, authenticated)
#    are expected and harmless.

# 3. Copy the files (rclone speaks S3, Google Cloud Storage and Azure Blob)
rclone copy source:media target:media --progress
rclone copy source:documents target:documents --progress   # private: keep it private on the target

#    Airports come along with the database; or re-run `npm run airports:import` on the target.

# 4. Point the app at the new database and storage (environment variables), deploy,
#    and check https://<new-site>/api/health
```

Accounts and passwords are in our own tables, so nobody has to sign up again. Keep the same
`BETTER_AUTH_SECRET`; if the site's address changes, people simply log in once more.
