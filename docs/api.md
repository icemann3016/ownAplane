# ownAplane API (v1)

For the mobile app and partner systems (requirements API-1…8, plan §4.9). The full, always
current description is generated from the code: **`/api/v1/openapi.json`** (OpenAPI 3.1; open it
in any OpenAPI viewer, e.g. Swagger Editor, or generate a typed client from it).

## Sign in (apps)

```http
POST /api/auth/sign-in/email
Origin: ownaplane://app
Content-Type: application/json

{ "email": "pilot@example.com", "password": "…" }
```

The token is in the **`set-auth-token`** response header. Send it with every API request:

```http
GET /api/v1/me
Authorization: Bearer <token>
```

- Sign out (revokes the token): `POST /api/auth/sign-out` with the same two headers and `{}`.
- Tokens also stop working after "sign out everywhere", a password change or a suspension.
- The API never accepts cookies. Apps shouldn't keep them (`fetch(…, { credentials: "omit" })`);
  sign-in requests that carry cookies need the `Origin` header (CSRF protection).
- `Origin: ownaplane://…` is the apps' origin, trusted by the server (`APP_ORIGIN` in
  `lib/auth/auth.ts`). Sign-in is rate-limited (a few attempts per 10 seconds per address).

## Conventions

- JSON in and out; single objects as `{ "data": … }`, lists as `{ "data": [...], "nextCursor": … }`.
- Errors: `{ "error": { "code": "not_found", "message": "…", "fields"?: { "field": ["…"] } } }`
  with the HTTP status (400 `validation_failed`/`bad_request`, 401 `unauthorized`, 403, 404
  `not_found`, 409 `conflict`, 429, 500 `internal`). `message` is for developers (English).
- Times ISO 8601 in UTC. Quantities in SI units as stored (litres, kg, minutes). Money as numbers
  with an ISO currency code.
- Invalid query parameters are errors (400), not ignored.
- Responses are never cached (`cache-control: no-store`), except the OpenAPI description.

## Endpoints (M11)

| Method | Path | Sign-in | What |
|--------|------|---------|------|
| GET | `/api/v1/me` | required | Account, profile, roles, settings |
| GET | `/api/v1/airports?q=` | – | Search European airfields |
| GET | `/api/v1/airports/{ident}` | – | One airfield |
| GET | `/api/v1/aircraft?airport=&radius=&from=&to=&…` | optional | Search listed aircraft (`eligible=true` needs sign-in) |
| GET | `/api/v1/aircraft/{id}` | optional | A listed aircraft, or one of your own |
| GET | `/api/v1/bookings` | required | Your bookings as pilot and owner |
| GET | `/api/v1/bookings/{id}` | required | One booking with its history |

Calendar sync endpoints for partner systems are listed below.

Next (M13): booking actions, flight log, messages, notifications through the API.

## Calendar sync for other booking systems (SYN-1…5)

An aircraft's owner connects other systems under **Aircraft → Calendar sync** (help article
`/help/calendar-sync`). Each connection works in one of these ways, and every connection also gets
a private iCal link with our busy times (without its own, so nothing echoes back):

| The other system… | How |
|---|---|
| **pushes its bookings to us** (real time, any system that can call a URL) | API key `oap_…` from the owner, endpoints below |
| publishes an **iCal link** | we read it every 15 minutes and right before a booking is requested or accepted |
| publishes a **JSON link** | same, format below |
| only reads ours | subscribes to `/api/v1/calendars/<token>.ics` |

### Push API (API key)

All with `Authorization: Bearer oap_…`; the key decides the aircraft.

| Method | Path | What |
|--------|------|------|
| GET | `/api/v1/sync` | Which connection and aircraft the key belongs to |
| GET | `/api/v1/sync/busy?from=&to=` | When the aircraft is busy in ownAplane (bookings, requests, blocks, other systems; not yours). **Check before you confirm a booking.** |
| PUT | `/api/v1/sync/busy/{yourId}` | `{ "start": "…Z", "end": "…Z" }`: create or move one booking. **409 `conflict`** if it overlaps an ownAplane booking: it is still recorded, the owner is told to resolve it |
| DELETE | `/api/v1/sync/busy/{yourId}` | The booking was cancelled; the time is free again |
| PUT | `/api/v1/sync/busy` | `{ "busy": [ { "id", "start", "end" } ] }`: replace everything (a full snapshot); missing ids are removed. Returns the ids that conflict |

Statuses: `active` (blocks the aircraft), `covered` (the owner had already blocked that time),
`ignored` (in the past or more than 400 days ahead), `conflict` (409, see above).

**Avoiding double bookings both ways:** before your system confirms a booking, ask
`GET /api/v1/sync/busy` (or read our iCal link); after it confirms, `PUT` it at once. ownAplane
does the same in reverse: it refreshes linked calendars right before a request or acceptance, and
refuses an acceptance while another system has the time.

### JSON link format

```json
{ "busy": [ { "id": "42", "start": "2026-10-20T08:00:00Z", "end": "2026-10-20T11:00:00Z" } ] }
```

A plain array works too, and `from`/`to` instead of `start`/`end`. Times are ISO 8601 with an
offset. Links must be public `https` addresses (no private networks), answer within 8 seconds
and be at most 2 MB; recurring iCal events are expanded for the next 400 days.

### Scheduled reading

`/api/cron/sync` (with `Authorization: Bearer $CRON_SECRET`) reads links not read for 10 minutes.
It runs every 15 minutes from GitHub Actions (`.github/workflows/calendar-sync.yml`, needs the
repository secret `CRON_SECRET`, same value as on Vercel) and hourly as part of the daily job.

## For developers of this repo

- Endpoints live in `app/api/v1/**/route.ts` and stay thin: `apiRoute(async (request) => …)`,
  check the token with `requireApiUser()` / `optionalApiUser()`, validate input with a schema
  from `lib/api/schemas.ts`, call the same `lib/` functions the website uses, and return a DTO
  from `lib/api/dto.ts`.
- Every DTO returns a type from `lib/api/responses.ts`; the OpenAPI description
  (`lib/api/openapi.ts`) is built from those schemas, so add new endpoints there too.
- Guards in `npm test` (`lib/api/routes.test.ts`): every endpoint uses `apiRoute` and checks the
  token unless it's on the short public list. Browser tests: `tests/e2e/api.spec.ts`.
