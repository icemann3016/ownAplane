# CLAUDE.md

@AGENTS.md

This file tells Claude how to work in this repo. Claude reads it at the start of every session.
**Keep it up to date.** When the two of us agree on a decision, write it down here.

## Project

- **Name:** ownAplane (code/technical name: `ownaplane`)
- **What it is:** A European general aviation marketplace: pilots rent aircraft from owners (with verified licences and two-way ratings), owners hire maintenance technicians, and airports take PPR, parking, hangar and service requests online.
- **Requirements:** [`docs/business-requirements.md`](docs/business-requirements.md) is the source of truth for *what* to build. **Read it before starting any feature** and reference requirement IDs (e.g. `BKG-3`) in branches, commits and PRs.
- **Plan:** [`docs/implementation-plan.md`](docs/implementation-plan.md) has the architecture, data model and milestones M0–M10. Tasks are GitHub issues. **Work on the current milestone's issues in order** and follow the plan's key technical decisions (§4).
- **Current phase:** Phase 1 (MVP) — accounts, pilot verification, aircraft listings, search, booking requests, ratings. Don't build Phase 2–4 features unless asked.
- **Team:** Zlati + friend, each working with our own Claude.
- **Status:** M0 done. Live at https://ownaplane.eu (every push to main deploys). **M1 done:** accounts, profiles, roles, public profiles, Google, Apple and Facebook sign-in (each needs its keys), data export + account deletion, English/Bulgarian/German/French/Italian/Spanish + units preference. **M2 done:** 7,392 European airfields (OurAirports) with time zones, airport search box, home airfield linked to airports. **M3 done:** pilot credentials (licences, ratings, medical, experience) with private document upload, admin verification queue with audit log, verified badges on public profiles, daily expiry reminders. **M4 done:** aircraft listings (step-by-step form saved as a draft, photos, CofA/ARC/insurance verified by admins, reference documents, rental requirements), My aircraft dashboard, public aircraft page, auto-unlist when the ARC or insurance expires. **M5 done:** aircraft calendar with a no-overlap constraint and owner calendar page, eligibility check (`my_eligibility()`, incl. the night rule), search by airfield/radius/dates/filters with list and map (MapLibre + OpenFreeMap), aircraft page with availability and "can I rent this". **M6 done:** booking requests with owner answers, expiry and cancellation policies, flight log (check-out, legs, fuel/oil with receipts, remarks and known items, check-in, owner confirmation, amount due), defects and grounding, usage history with CSV exports, notifications (in-app + email, reminders), checkout flights, instant booking. Weather warnings (METAR/TAF) on bookings and flight logs. **M7 done:** double-blind two-way reviews with category scores, owner replies, rating averages. **M8 done:** messages (booking and listing conversations, one email per unread streak), contact details after acceptance. **M9 done:** reports queue, suspend/unlist/hide with audit log, admin dashboard. **M10 prepared:** draft terms/privacy/cookies (lawyer review pending), security review (`docs/security-review.md`), error monitoring + cookie-less analytics hooks (need keys), accessibility checks (`docs/accessibility.md`), production checklist (`docs/deployment.md`), demo data + beta plan (`docs/private-beta.md`). **M11 done:** REST API foundation for apps and partners (`/api/v1`, token sign-in, account/airports/aircraft/bookings, OpenAPI at `/api/v1/openapi.json`, `docs/api.md`). **M12 done:** calendar sync with other booking systems (Aircraft → Calendar sync: push API with a key, iCal or JSON link, private iCal export per connection, double-booking conflicts with alerts, read every 15 min and before each request/acceptance). User guide: the in-app **Help** section at `/help`, articles in `content/help/{en,bg}/*.md` (update both languages with every feature).
- **Domain:** https://ownaplane.eu (Vercel; `BETTER_AUTH_URL=https://ownaplane.eu`). The *.vercel.app addresses keep working (trusted automatically). Next infra step: real email via SMTP (Resend) on ownaplane.eu, then switch on email verification.
- **Portability:** the app must stay movable to Google Cloud or Azure: no provider-specific SDKs outside `lib/storage` and `lib/email` drivers. See [`docs/deployment.md`](docs/deployment.md).

## Tech stack

- Next.js 16 (App Router, Server Components, Server Actions) + React 19 + TypeScript (strict), Node.js 22
- UI: Tailwind CSS v4 + shadcn/ui (`components/ui/`, add more with `npx shadcn@latest add <name>`). Forms: Zod + `useActionState`
- **Languages:** next-intl, English, Bulgarian, German, French, Italian, Spanish (`messages/{en,bg,de,fr,it,es}.json`); language from a cookie/user setting, else the browser. No locale in URLs. Help articles and legal pages exist in English and Bulgarian (`contentLocales`); other languages show the English text with a note.
- **Database:** PostgreSQL 14+ through **Drizzle ORM** (`postgres` driver). Hosted on Supabase today, but we use it as *plain Postgres* only. **RLS on every table.**
- **Login:** **Better Auth** (`lib/auth/auth.ts`), users/sessions in our own tables
- **Files:** `lib/storage` (drivers: `s3` = Supabase Storage / Google Cloud Storage / AWS / R2, `azure`, `local`)
- **Email:** `lib/email` (drivers: `smtp`, `console`)
- Tests: Vitest (unit + database) + Playwright · Hosting: Vercel (`fra1`) today, `Dockerfile` for Cloud Run / Azure Container Apps · CI: GitHub Actions
- Never import `@supabase/*`, Google or Azure SDKs outside the storage/email drivers. Ask before adding any other significant dependency.

## Commands

```bash
npm install          # install dependencies
npm run dev          # dev server at http://localhost:3000 (emails are printed in this terminal)
npm run typecheck    # TypeScript check (generates route types first)
npm run lint         # ESLint
npm run format       # Prettier: format all files (format:check in CI)
npm test             # unit tests + database tests (database tests need TEST_DATABASE_URL, else skipped)
npm run test:e2e     # browser tests (Playwright), desktop + mobile. E2E_FULL=1 adds the sign-up journey
npm run build        # production build

npm run db:generate        # create a migration from changes in lib/db/schema
npm run db:custom -- name  # create an empty SQL migration (RLS policies, grants, functions, triggers)
npm run db:migrate         # apply migrations to DATABASE_URL (production: automatic on deploy)
npm run db:studio          # browse the database in the browser
npm run airports:import    # (re)load European airfields from OurAirports; -- --file x.csv for a local file
npm run admin:grant -- me@example.com   # make a user an admin (add --revoke to remove)
npm run demo:seed -- --yes              # demo owners, pilots, aircraft, bookings (--remove to delete)

docker build -t ownaplane .   # production container
docker compose up -d db    # local Postgres (no cloud account needed)
```

CI runs typecheck, lint, format:check, unit + database tests, build, the full e2e journey against a throwaway Postgres, and a Docker build.

## Project structure

```
app/
  (marketing)/        # public pages: home, terms, privacy, cookies (content/legal), help (knowledge base)
  (auth)/             # login, signup, forgot/reset password + actions.ts (auth Server Actions)
  (app)/              # logged-in pages: dashboard, account (+ credentials tab), admin/verifications,
                      #   u/[id] (public profile), aircraft/[id] (public listing + availability),
                      #   search, owner/aircraft (my aircraft, new, [id]/calendar, details…requirements,
                      #   defects, remarks, usage, sync), bookings/[id] (+ log, reviews, contact), notifications,
                      #   messages (+ [id], new), reports (actions), welcome (setup guide), admin (dashboard, verifications,
                      #   reports, users, aircraft, audit)
  api/auth/           # Better Auth endpoints (email links, OAuth callbacks; apps sign in here for a token)
  api/v1/             # REST API for apps and partners (docs/api.md): me, airports, aircraft, bookings,
                      #   openapi.json; thin handlers around lib/ (apiRoute + requireApiUser + DTOs);
                      #   sync/ (partner systems, API key) and calendars/[token].ics (iCal export)
  api/cron/sync/      # reads linked calendars every 15 min (GitHub Actions schedule, CRON_SECRET)
  api/account/avatar/ # photo upload
  api/documents/      # private document upload (POST) and viewing ([id], owner/admin only)
  api/aircraft/[id]/photos/ # aircraft photo upload (owner only)
  api/cron/daily/     # daily job (expiry reminders, clean-up), needs CRON_SECRET
  api/health/         # health check for load balancers
  api/errors/         # browser errors → error monitoring
  error.tsx           # error page (reports browser errors)
  files/              # serves uploads when STORAGE_DRIVER=local
components/
  ui/                 # shadcn/ui primitives (Button, Card, Dialog, Sheet, DropdownMenu…)
  forms/              # TextField, TextAreaField, SelectField, SubmitButton, FormMessage
  pilot/              # StatusBadge, ExpiryText
  aircraft/           # AircraftStatusBadge, MonthCalendar, RequirementsList, SectionHeading…
  document-field.tsx  # upload a private document in a form (submits its id)
  layout/             # SiteHeader, UserMenu, MobileNav, SiteFooter, LanguageSwitcher, Logo (+ LogoMark)
  auth/               # SocialSignIn (Google/Apple/Facebook buttons), ProviderIcon
  marketing/          # home page: HomeHero, AudienceCards, PhotoStrip, HowItWorks, ClosingCta
  airport-picker.tsx  # airport search box (combobox), submits the airport ident
lib/
  auth/               # auth.ts (Better Auth config), session.ts (getUser, requireUser, requireAdmin…), errors.ts
  api/                # REST API core: http.ts (apiRoute, ApiError, parse), auth.ts (Bearer tokens only),
                      #   schemas.ts (inputs), responses.ts (output shapes), dto.ts, openapi.ts
  account/            # profile.ts (profile, roles, settings), delete-files.ts
  calendar-sync/      # other booking systems (SYN): events, apply (store busy times, conflicts),
                      #   feeds (safe fetch, iCal via ical.js, JSON), sync, busy, ics (export), keys, owner
  admin/              # verification queues, moderation (suspend, unlist, hide, reports), members, roles, queries, metrics
                      #   (trusted admin code, after requireAdmin())
  reviews/            # review queries, submit/reply, daily publishing
  messages/           # conversations, unread counts, message emails
  reports/            # createReport()
  monitoring/         # reportError() → any Sentry-compatible service (SENTRY_DSN), no SDK
  legal.ts            # terms/privacy/cookie pages from content/legal
  pilot/              # catalog (licence types, ratings), labels, validity/summary, credentials, reminders
  aircraft/           # catalog, queries, photos, documents, requirements, expiry (daily job), public page data,
                      #   calendar, eligibility (+ eligibility-text), search
  weather/            # METAR/TAF from aviationweather.gov, parsing, booking warnings
  domain/             # pure logic: units (L/US gal, kg/lb), time (airport-local ↔ UTC, calendar days)
  documents.ts        # save/read/delete private documents (checks file content, logs admin views)
  files/sniff.ts      # detect file type from content
  db/                 # index.ts (connection), rls.ts (asUser/asAnon), schema/ (Drizzle tables)
  airports.ts         # searchAirports(), getAirport(), airportPlace()
  storage/            # file storage drivers
  email/              # email drivers + templates
  validation/         # Zod schemas shared by forms and Server Actions
  forms.ts            # FormState type + helpers for useActionState forms
  i18n/               # config.ts (locales, resolveLocale), server.ts (localizedFieldErrors, setLocaleCookie)
  site.ts             # app name + navigation (rename the app here)
db/migrations/        # SQL migrations (generated + custom), applied with npm run db:migrate
messages/             # translations: en.json (source) + bg, de, fr, it, es (same keys)
i18n/request.ts       # picks the language for each request
scripts/              # import-airports.mjs (+ airports/transform.mjs), grant-admin.mjs, seed-demo.mjs,
                      #   create-github-issues.mjs
tests/                # e2e/ (Playwright), db/ (database security tests), fixtures/ (test airports)
docs/                 # requirements, implementation plan, deployment guide
content/help/         # help articles (Markdown, en/ + bg/), shown at /help
content/legal/        # terms, privacy, cookies (Markdown, en/ + bg/), drafts until lawyer review
instrumentation.ts    # server errors → lib/monitoring
proxy.ts              # per-request CSP nonce (lib/csp.ts)
Dockerfile, docker-compose.yml
```

Target structure for the rest of the app is in the plan, §6. When new top-level folders are added, list them here.

## Database workflow

- The schema changes **only** through migrations in `db/migrations/`. Tables: edit `lib/db/schema/*.ts`, then `npm run db:generate`. RLS policies, grants, functions, triggers: `npm run db:custom -- <name>` and write SQL (separate statements with `--> statement-breakpoint`). Apply with `npm run db:migrate`. Never change tables by hand in a dashboard.
- **Every table** has RLS enabled (`.enableRLS()` in the schema) and explicit policies `TO app_user` in a custom migration. Policies use `app.current_user_id()`. Grant `app_user` only the columns users may change.
- **User-facing queries** go through `asUser(userId, tx => …)` or `asAnon(tx => …)` from `lib/db/rls.ts`, so RLS applies. `getDb()` (owner, bypasses RLS) only for Better Auth and trusted admin/cron code, after checking permissions.
- Every migration with tables/policies gets tests in `tests/db/` (like `security.test.ts`): check what anonymous visitors, the owner and another user can and cannot do.
- Use only plain PostgreSQL features available on Supabase, Cloud SQL and Azure. New extensions: note them in `docs/deployment.md`.
- Don't name SQL functions like common helpers (`has_role`, `is`, `ok`…); we use `user_has_role()`.
- Keys live in `.env.local` (see `.env.example`). Share them with teammates through a password manager, never in git or chat.

## Domain rules (aviation)

- Region: **Europe / EASA** rules and terms (PPL/LAPL, Part-66, Part-ML, ARC). Not FAA.
- **All times are UTC**: stored, entered, shown, emailed and exported, labelled "UTC" on a 24-hour clock (`formatUtc()`, `formatSpan()` in `lib/aircraft/format.ts`). Calendar days, "per day" prices and usage months are UTC days/months. No airport-local times (aviation convention). The night rule still uses the real sunset/sunrise at the airfields.
- Airports come from the `airports` table and are identified by their OurAirports **ident**: the ICAO code when there is one (`LBSF`), otherwise a local id (`BG-0004`, many small airfields). Show `code` (ICAO or ident) to users. Pick airports with `AirportPicker`, never free text. Each airport has an IANA `timezone` for local times.
- Medical certificate data is GDPR special-category data: only the pilot and admins see it. Public profiles show only verified licence types and ratings (`public.pilot_badges`), never numbers, documents or medical data. For bookings, owners will only get a yes/no "meets requirements".
- Private documents live in private storage and are only served by `app/api/documents/[id]` (owner or admin, else 404). Admin views and decisions are written to `admin_actions`.
- Credentials count only when **verified and not expired** (`isUsable()` in `lib/pilot/validity.ts`). Editing a verified item sends it back to "pending" (database trigger).
- The app never replaces official records (CRS, logbooks), ATC clearance or customs procedures. Say so in the UI where relevant.

## Conventions

- **Auth:** protect pages, Server Actions and route handlers with `requireUser()` / `requireProfile()` (or `getUser()`) from `lib/auth/session.ts`. They redirect to `/login?next=…`. Admin pages and actions use `requireAdmin()` (404 for everyone else). Call Better Auth on the server via `getAuth().api.*`; read its error codes with `authErrorCode()`.
- **Forms:** a Server Action `(prev: FormState, formData) => Promise<FormState>` validates with a Zod schema from `lib/validation/`, and a client form uses `useActionState` + `TextField` + `SubmitButton` + `FormMessage`. Return `values` (never passwords) so fields refill after errors.
- **Text & translations:** never hard-code user-facing text. Add keys to **every** `messages/*.json` (en is the source; a unit test checks all have the same keys, placeholders and tags). Server Components: `await getTranslations("ns")`; Client Components: `useTranslations("ns")`; page titles via `generateMetadata`. Zod messages are keys from the `validation` namespace, translated with `localizedFieldErrors()`. Format dates/numbers with the user's locale (`intlLocale()`).
- **API (API-1…5):** anything an app or partner needs gets an endpoint in `app/api/v1` that calls the same `lib/` function as the website (never duplicate logic in a route), with an input schema in `lib/api/schemas.ts`, a response shape in `lib/api/responses.ts`, a DTO in `lib/api/dto.ts`, an entry in `lib/api/openapi.ts` and a case in `tests/e2e/api.spec.ts`. Keep `docs/api.md` current.
- **Headings:** every page has one `h1`. `CardTitle` takes `as="h1" | "h2" | "h3"` when it's a page or section title.

- TypeScript everywhere. No `any` unless there's a comment explaining why.
- Server Components by default. Add `"use client"` only when a component needs state, effects or browser APIs.
- Component files: `PascalCase.tsx`. Other files: `kebab-case.ts`.
- Import from the project root with `@/` (e.g. `import { x } from "@/lib/x"`).
- Keep components small. If a file passes about 200 lines, split it.
- Secrets go in `.env.local` (git-ignored). Add new variable names to `.env.example`.

## How Claude should work here

> **Solo mode (current):** While Zlati works alone, commit directly to `main` in small commits (steps 2 and 6 about branches don't apply yet). **Claude pushes to `main` itself** (Zlati, 2026-10-08): work on the session branch, run typecheck/lint/format/tests (+ the relevant e2e), push the branch, then push the same commits to `main` (fast-forward; every push deploys). Production migrations run on deploy, so no manual `db:migrate`. **When the friend joins, delete this note** and switch to branches + PRs.

1. **Start from an up-to-date `main`.** Run `git pull` before starting.
2. **One branch per task:** `<name>/<issue-number>-<short-description>`, e.g. `zlati/9-signup`.
3. **Keep changes small and focused.** One issue per branch/PR. For anything non-trivial, propose the approach before coding.
4. **Before finishing:** meet the definition of done in the plan (§9): acceptance criteria, RLS + tests for new tables, and typecheck/lint/test/build passing.
5. **Commit messages:** short and imperative, with the issue number, e.g. "Add sign-up form (#9)".
6. **Never** commit secrets, push directly to `main`, or add a big dependency without asking.
7. **Ask before** changing the tech stack, the folder structure, or anything in this file.
8. If a task touches an area the other person owns (see below), say so in the PR.

## Who owns what

_TODO: split areas so we don't edit the same files at the same time._

| Area | Owner |
|------|-------|
| _e.g. UI / pages_ | _Zlati_ |
| _e.g. data / API_ | _friend_ |

## Decisions log

Add one line per decision, newest first.

- 2026-10-09: **Calendar sync built** (Zlati: the other system is custom, so it must work with any kind): connections per aircraft (`calendar_connections`, max 10) by push API (key `oap_…`, hashed), iCal link (`ical.js`, approved), JSON link, or export only; every connection gets its own iCal export without its own bookings. External busy times are `unavailable` calendar entries with `connection_id`, under the same exclusion constraint; clashes with bookings are kept inactive as conflicts, the owner is notified (`calendar_conflict`), a trigger activates them once the booking is gone, and accepting is refused meanwhile. Feeds: https only, no private addresses, 8 s / 2 MB. Read every 15 min by `.github/workflows/calendar-sync.yml` (needs the GitHub secret `CRON_SECRET`), hourly by the daily job, and before each request/acceptance. Help: `/help/calendar-sync`; developers: `docs/api.md`.

- 2026-10-08: **API for apps and partners + calendar sync** (Zlati: a mobile app is planned, and aircraft booked in other systems must not be double-booked): one backend core in `lib/` (operations `(userId, input) → result`), used by both the website's Server Actions and a versioned REST API `/api/v1` (Bearer tokens only, never cookies; OpenAPI from the Zod schemas). The website keeps server-rendering. Calendar sync via iCal import/export and a partner push API, external busy times stored in `calendar_entries` so the exclusion constraint covers them. Requirements API-1…8, SYN-1…7; plan §3, §4.9, §4.10, milestones M11–M13.

- 2026-10-08: **Claude deploys; migrations on deploy** (Zlati): Claude pushes tested commits to `main` itself. Vercel production deploys run `npm run vercel-build` (`vercel.json` `buildCommand`): `scripts/migrate-on-deploy.mjs` applies pending migrations with `DATABASE_URL_MIGRATIONS` (Supabase Session pooler, port 5432, Production only) before `next build`; a failed migration fails the deploy and the previous version stays live. Preview deploys, CI and Docker skip it; without the variable it only warns. So migrations must stay backward compatible with the version still live during the build.

- 2026-10-02: **Flight log checks** (Zlati): leg times in the order they happen, engine start ≤ block off < take-off < landing < block on ≤ engine stop, max 12 h (`legTimeIssues()` in `lib/domain/leg-times.ts`, field errors in the form; DB check `flight_legs_times`). Hobbs/tach end > start; within a leg fuel after < before and oil after ≤ before ("after" = on arrival, before refuelling); fuel/oil added between or after legs are uplifts. Between legs a rise beyond the uplifts recorded at that airfield (2 L fuel / 0.3 L oil tolerance) or an uplift at an airfield not on the route is a **warning** to pilot and owner (`lib/domain/fuel-checks.ts`), not a block. Fuel is entered in L or US gal per form (stored in litres). Migration 0051 adds the new checks NOT VALID, so older legs (saved with block off before engine start) stay readable.

- 2026-10-02: **Subscriptions planned, not built** (Zlati): owners pay, pilots always free; Free (1 aircraft) / Owner / Fleet plans, safety features never paid, limits enforced in the database, nothing deleted on downgrade. Requirements SUB-1…12 and the plan table in `docs/business-requirements.md` §5.11 and §8. Don't build until asked; prices and payment provider (Paddle vs Stripe) still open.

- 2026-09-29: **Member management** (Zlati): Admin → Members has filters (pilots, owners, admins, suspended, credentials to check, email not confirmed), search, sorting and paging (`lib/admin/members.ts`); each member has a page (`/admin/users/[id]`, `lib/admin/member-detail.ts`) with account, credentials status, aircraft, bookings, open reports, admin history and all actions. Admins give/remove admin rights there (`lib/admin/roles.ts`, logged as `grant_admin`/`revoke_admin`): never your own, never to a suspended member; any admin can remove another's rights (`npm run admin:grant` still works as a fallback).

- 2026-09-29: **Logo** (Zlati): wordmark "own" + an A drawn as a delta-wing aircraft seen from above + "plane" (`components/layout/logo.tsx`, the A in `logo-mark.tsx`, in the primary colour; screen readers hear "ownAplane"). The same A, white on blue, is the browser icon (`app/icon.svg`), phone icon (`app/apple-icon.png`) and app icon for Facebook/Apple (`docs/brand/app-icon-1024.png`).

- 2026-09-29: **Admins delete members** (Zlati): Admin → Members → Delete member (`deleteMember()` in `lib/admin/moderation.ts`), the same clean-up as self-deletion (`lib/account/delete-files.ts`, then the `users` row; FKs cascade or set null), logged in `admin_actions` as `delete_user`. Refused for yourself, for admins (remove the role first) and while the member has open bookings (requested/accepted/in progress) on either side; suspend meanwhile.

- 2026-09-29: **Six languages** (Zlati): the app, its emails and dates/numbers in English, Bulgarian, German, French, Italian and Spanish (`lib/i18n/config.ts`, `user_settings_locale` check widened in `0050_more_languages`). New languages were machine-translated from `en.json` and should get a native speaker's read before launch. Help articles and legal pages stay English + Bulgarian for now (legal texts need the lawyer's review first); the other languages show English with a note. Language switcher fixed: it showed the previous language after a change (React resets the form after an action; the select is now keyed by the locale).

- 2026-09-29: **Home page photos** (Zlati didn't like drawn artwork): real photos from Unsplash (free licence, no credit needed) in `public/images/home/` (sources in `CREDITS.md`), shown with `next/image` (static imports, blur placeholders, served from our own site so the CSP needs no change). Movement: slow zoom on the header photo and a sideways-scrolling photo strip, both still for "reduce motion". No stock video yet: Pexels/Pixabay block automated downloads; a clip can be added as a file in `public/` later.

- 2026-09-29: **Apple and Facebook sign-in** next to Google (ACC-1), all through Better Auth's built-in providers, each shown only when its keys are set (`lib/auth/providers.ts`; `APPLE_*`, `FACEBOOK_*`). Apple's client secret (a JWT valid ≤ 6 months) is made from the `.p8` key at start-up with Node's crypto (no new dependency), and the auth instance is rebuilt every 30 days. Same linking rule as Google: never automatic, connect from Account → Security; disconnect only while another way to log in remains. Facebook accounts without an email can't sign up (clear message). Setup steps in `docs/deployment.md`.

- 2026-09-29: **Setup guide + profile completion** (Zlati): sign-up (email and Google) lands on `/welcome`: choose pilot / owner / both (roles), then the steps for those roles with "Continue" to the next one. The dashboard shows "Profile N% complete" (`lib/profile-completion.ts`, pure + tested) that opens to what is left **for the user**; credentials and aircraft documents waiting for an admin count as done and are listed as "waiting". Dashboard cards: full width with one role, no bottom buttons (every item links to its page).
- 2026-09-29: **Dashboard as overview** (Zlati): a "To do" list of everything waiting for the user (requests to answer, flight logs to finish/confirm, open defects, ARC/insurance expiring within 30 days, credential problems, reviews due, unread messages/notifications), each linking to the page where it is done; then "As a pilot" and "As an owner" cards (counts, rating, credentials status, aircraft, next and recent bookings, shortcuts); getting-started steps only until done. Data from `lib/dashboard` with the user's own rights (RLS).
- 2026-09-29: **Strict CSP + axe.** `proxy.ts` sets a per-request nonce Content-Security-Policy (`lib/csp.ts`): scripts only with the nonce (`strict-dynamic`), styles from us (+ inline style attributes), images from our storage hosts and the map, connections to us, the map tiles and the analytics host. New external hosts must be added in `lib/csp.ts` (the CSP e2e test catches violations). Every page must stay dynamically rendered (the layout reads the locale cookie) so Next can apply the nonce. Dev dependency `@axe-core/playwright` (approved) checks WCAG 2.1 AA incl. contrast in light and dark mode; colour tokens darkened to ≥ 4.5:1.
- 2026-09-29: **Notification settings (MSG-3):** `user_settings` has email/in-app switches for bookings and reviews and an email switch for messages (default on). The `booking_events` trigger and the reminder job apply them (`notifications.in_app`; unwanted emails are marked sent; nothing is created when both are off); message emails skip people who turned them off. Always sent: defect emails, account/auth emails, document decisions and expiry reminders. Push stays for later.
- 2026-09-29: **Weather warnings built** (per the 2026-09-27 decision): `lib/weather` reads METAR/TAF text itself (visibility, BKN/OVC/VV ceiling) instead of trusting the API's derived fields; TAF periods are base/FM/BECMG/TEMPO/PROB windows, a warning is any below-minima period overlapping the booked time. Shown on the booking and the open flight log. The "no valid IR" line is shown **only to the pilot** (owners never see credentials); owners see the weather and whether the aircraft is IFR. Cached 10 min; if the service fails the card says so. Browser tests use a local stand-in (`tests/e2e/fixtures/weather-mock.mjs`, `WEATHER_API_URL`).
- 2026-09-29: **No Supabase backups for now** (Free plan). Real usage will move to Azure or Google Cloud, with managed backups set up there (`docs/deployment.md` §3–5). Until then, take a manual `pg_dump` before risky changes; photos and documents aren't backed up. Error monitoring is live (Sentry EU, `SENTRY_DSN`).
- 2026-09-28: **M10 preparation.** Legal pages are Markdown drafts (content/legal) with a "draft" note until a lawyer signs off; only strictly necessary cookies, so no banner. Error monitoring without an SDK: `lib/monitoring` posts to any Sentry-compatible envelope endpoint (`SENTRY_DSN`, e.g. Sentry EU or GlitchTip) without cookies, headers, queries or user data; analytics only cookie-less (Plausible/Umami via `NEXT_PUBLIC_ANALYTICS_*`). Security review guards run in `npm test` (RLS everywhere, SECURITY DEFINER hygiene, every Server Action checks the caller); security headers in `next.config.ts` (no full CSP yet). Spam limits in the database (30 messages/10 min, 20 reports/day). Accessibility basics checked by e2e without axe. Demo data only via `npm run demo:seed` on non-production databases.
- 2026-09-28: **M9 admin (ADM-2…4).** Admins act with the owner connection after `requireAdmin()` and every action goes to `admin_actions`. Suspending deletes sessions, a Better Auth session hook refuses new ones (`ACCOUNT_SUSPENDED`), triggers refuse messages/reviews, eligibility refuses requests, and listed aircraft are unlisted (`unlisted_reason = 'suspended'`). An admin-unlisted aircraft (`'admin'`) can't be relisted by the owner until an admin allows it (status trigger). Reports: one table for reviews/users/aircraft/messages, anyone logged in reports what RLS lets them see, one open report per person and target; acting from a report resolves it. Dashboard numbers are plain SQL counts (30 days).
- 2026-09-28: **M8 messaging (MSG-1, MSG-2).** One conversation per booking (its pilot and owner) or per enquiry (person + listed aircraft); only the two participants read it (RLS), written through `start_conversation()` / `send_message()`, admins see a message only when reported. Read markers per side; one email per unread streak (after sending and in the daily job), no text in the email. Pages refresh every 20 s (no websockets). Phone (optional, `user_settings.phone`) and email go to the other side only for accepted/running/completed bookings via `booking_contacts()`.
- 2026-09-28: **M7 reviews (RAT-1…5).** One review per side per completed booking within 14 days of the owner confirming the flight log; category scores 1–5 (pilot→owner: aircraft condition, communication, value; owner→pilot: airmanship, punctuality, communication, condition returned), overall = average. Double-blind: visible only to the author until both reviewed (published at once) or the window closed (daily job; up to a day late). Averages by trigger on publish/hide: `profiles.rating_*` = as pilot (used by RAT-6), `profiles.owner_rating_*` = as owner, `aircraft.rating_*`. Only the owner replies (once, publicly); reviews can't be edited. Admins hide rule-breaking reviews, never just negative ones.
- 2026-09-28: **UTC everywhere** (Zlati: "no one in aviation uses local time"): replaces the earlier "airport-local time with UTC alongside" rule. Booking, search, calendar blocks, proposals and flight-log legs are entered in UTC; every date-time shown is UTC and labelled. Interactive calendar: everyone sees each entry's UTC times and kind (booking, pending request, own use, maintenance, unavailable) via `aircraft_calendar_view()`, never notes or pilots; owners also see the pilot (with a link) and block notes. Picking a first and last day pre-fills a booking request (pilots) or a calendar block (owners). Help centre at `/help` from Markdown in `content/help/{en,bg}`.
- 2026-09-28: Instant booking (BKG-4): an option in the rental requirements (`instant_booking`). `request_booking()` accepts at once when the pilot meets every requirement, no checkout flight is pending (a night flight note doesn't count) and the pilot has a **completed** booking of that aircraft; recorded as one `instant_booked` event, so the owner gets one notification. Grounded or unlisted aircraft can't be requested at all.
- 2026-09-28: Checkout flights (BKG-10): the owner can require a checkout flight with an instructor for every pilot new to the aircraft (`checkout_first_rental`), besides RAT-7's pilots without reviews. The owner records it on the booking (`aircraft_checkouts`: date, instructor, note; only for pilots who booked the aircraft); once recorded, `eligibility_failures()` no longer asks that pilot for one on that aircraft. It stays a condition shown to both sides, not a refusal; the app doesn't schedule the checkout flight itself.
- 2026-09-28: Notifications (BKG-9): a trigger on `booking_events` writes a `notifications` row for the other party (pilot and owner minus the actor; both when the system acted, e.g. expiry). Emails go out from those rows right after the action (`after()` → `deliverNotificationEmails()`, rows claimed with `FOR UPDATE SKIP LOCKED`, failures released for retry) and the daily job catches up (last 3 days). The daily job also creates one reminder for pilot and owner of accepted bookings starting within 36 h (Vercel Cron runs daily, so not exactly 24 h). Defects keep their own detailed email (in-app row only). Bell with unread count in the header; `/notifications` marks all read. Push notifications later.
- 2026-09-28: Defects and grounding (BKG-8): defects (minor / major / unsafe, description, optional photo) are reported through `report_defect()` by the pilot of an accepted, running or completed booking, or by the owner; the owner is emailed at once and sees them in the aircraft's Defects tab (reporter, owner and admins only; the owner may open the photo). The owner grounds the aircraft (status `grounded`); while grounded it can't be requested, accepted or checked out (`bookings_check_grounded` trigger), and clearing means listing it again (listing checks apply). Defects are fixed with `resolve_defect()` and a note. Not a technical log: no CRS or deferred-defect handling.
- 2026-09-28: Remarks and known items (BKG-15): the pilot adds remarks (aircraft / weather / airfield) to the flight log while it's editable; the aircraft's owner sees them per booking and in the aircraft's Remarks tab, and marks aircraft remarks as **known items** (and later as fixed) with `set_known_item()`. Open known items are shown to pilots with a requested, accepted or in-progress booking of that aircraft via `known_items_for_aircraft()` (text and date only, never who wrote them). Defects that affect airworthiness stay separate (BKG-8, KAN-56).
- 2026-09-28: Fuel and oil in the amount due (BKG-13/14): fuel/oil uplifts store quantity (L), price in the booking's currency and who paid (pilot / owner's account). Wet rate: fuel the pilot paid for is taken off; dry rate: fuel from the owner's account is added; **oil is part of both rates**, so oil the pilot paid for is always taken off (`fuelSettlement()`). Entries without a price don't count and are flagged. The other party of a booking can open the flight log's check-out photo and receipts (`flight_log_document_visible()`); only admin views go to the audit log.
- 2026-09-27: Night and weather in bookings (M6). Legally what counts is the **booked flight's departure and arrival airfields** (and any stops), never the aircraft's or the pilot's base: the rental is night if it is night at any of them (30 min after sunset to 30 min before sunrise) → night-VFR aircraft + Night rating. Before a booking exists (search, aircraft page) the aircraft's base is used as a preview only, and the UI says so. Weather (IFR) is a **warning, never a block** (PIC decides), shown to pilot and owner: TAF once departure is within its range (~24–30 h), METAR as the flight approaches and at check-out, for every airfield of the flight. Airfields without a METAR use the nearest reporting station within 50 km (Lesnovo LBLS → LBSF), else "no weather report nearby". Below VFR = EASA minima (visibility < 5 km or ceiling BKN/OVC/VV < 1,500 ft); warn when the pilot has no valid IR or the aircraft isn't IFR. Source: aviationweather.gov (NOAA, free, no key).
- 2026-09-27: Night rule: any part of a rental from 30 min after sunset to 30 min before sunrise at the home base is **night**: the aircraft must be approved for night VFR and the pilot needs a verified, valid Night rating (`period_needs_night()`, sunrise/sunset in plain SQL, polar night/midnight sun handled). Night-period searches hide aircraft without night VFR. Map: MapLibre GL + OpenFreeMap tiles (no key; `NEXT_PUBLIC_MAP_STYLE_URL` to change).
- 2026-09-27: M5. Radius search uses plain SQL great-circle distance on airport lat/lon (no PostGIS; fine at our scale, stays portable); distances in km. Only extension: `btree_gist` for the calendar's exclusion constraint. Search times are local to the chosen airfield (UTC without one); filters live in the URL. Pilots see only busy periods of other people's aircraft (`aircraft_busy_periods()`), never notes or kinds. Eligibility is one SQL function (`eligibility_failures()`, not callable by users): pilots get their own reasons via `my_eligibility()`, owners only a yes/no via `pilot_meets_requirements()`. Credentials must be valid on the last day of the rental. Aeroplanes need a SEP/MEP (land) class rating and TMGs a TMG or SEP (land) rating automatically; ultralights and helicopters rely on the owner's required ratings. A checkout-flight requirement is a condition, not a refusal. Date of birth is optional in the pilot's experience, used only for minimum age.
- 2026-09-27: M4 aircraft listings. An aircraft can only be **listed** with a home base, price, ≥ 1 photo and a verified, unexpired ARC and insurance (`aircraft_listing_gaps()` + trigger); drafts never come back. Renewed ARC/insurance are added as new documents (the old one counts until the new one is verified); edits or deletions that would leave a listed aircraft without them are refused. The daily job unlists aircraft whose ARC/insurance expired and reminds owners 30 days before. Photos are public files (`aircraft/<id>/…`, max 20, shrunk in the browser); documents reuse the private `documents` storage. Quantities stored in SI (L/h, kg) and shown in the user's units. Registrations are unique among non-draft aircraft. Reference documents (POH, checklists, W&B) will be shared with renters once bookings exist (M6).
- 2026-09-26: Flight log added to M6 (BKG-7, BKG-12…16): per booking, legs with block and engine times, meters, fuel and oil before/after, refuelling and oil uplifts with receipts, remarks/PIREPs with "known items", usage history for owners. Stored in SI units and UTC; the amount due follows the aircraft's time basis (plan §4.8). Not an official journey/tech log.
- 2026-09-26: M3: private documents are served through the app (not presigned URLs) so access checks and audit logging work the same on every provider. Uploads ≤ 4 MB (Vercel limit); big photos are shrunk in the browser; file type checked by content. Admins verify with the owner connection after `requireAdmin()`, with an optimistic check (`updated_at`) and no self-review. Scheduled work runs through `/api/cron/daily` with `CRON_SECRET` (Vercel Cron today; Cloud Scheduler / Azure later). Email for real still pending (console driver).
- 2026-09-26: Custom domain ownaplane.eu. Google is only linked to an existing email/password account from Account → Security while logged in (Better Auth refuses implicit linking to unverified emails, which protects against account pre-hijacking).
- 2026-09-26: M2: airports keyed by OurAirports ident; only EU large/medium/small airports (no heliports/closed). Coordinates stored as plain lat/lon (no PostGIS yet; decide in M5 for radius search). Airport data is refreshed with `npm run airports:import`; stale rows are kept, not deleted.
- 2026-09-26: M1 finished. i18n with next-intl without locale routing (cookie + user_settings + Accept-Language). Google sign-in via Better Auth (button hidden until GOOGLE_* keys exist). Account deletion with password + typed confirmation; data export as JSON without secrets.
- 2026-09-26: App name is **ownAplane** (technical name `ownaplane`). Change the display name only in `lib/site.ts`.
- 2026-09-26: **Portable stack.** Replaced Supabase Auth/SDK with Better Auth + Drizzle on plain Postgres, file storage and email behind drivers, Docker image + deployment guide, so the app can move to Google Cloud or Azure. Supabase is now only the Postgres + file host. RLS kept via the `app_user` role and `app.user_id` setting.
- 2026-09-26: M1: forms use React 19 `useActionState` + Zod in Server Actions (no react-hook-form for now). Profiles are public; private settings live in `user_settings`. Column-level grants stop users changing ratings/suspension. Avatars upload from the browser to the `avatars` bucket (folder = user id).
- 2026-09-26: M0: shadcn/ui components copied into components/ui (new-york style, radix-ui). Dark mode follows the OS setting. Supabase CLI installed as a dev dependency (use `npx supabase …`). Vercel region fra1 via vercel.json.
- 2026-09-26: Stack = Supabase (EU) + Tailwind/shadcn + Vercel. Plan in docs/implementation-plan.md, tasks as GitHub issues (M0–M10). Solo mode: commit to main until the friend joins.
- 2026-09-26: Region = Europe/EASA. MVP = aircraft rental + ratings. Payments off-platform in MVP (no money through the app); in-app payments planned for Phase 4.
- 2026-09-25: Started with Next.js + TypeScript. Workflow is GitHub PRs, one branch per task.
