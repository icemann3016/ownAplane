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

## Limits (API-6)

Requests per minute (a calendar minute, UTC), counted in the database so all servers share them:

| Caller | Limit |
|--------|-------|
| App user (per token) | 240 |
| Connected system (per `oap_` API key) | 600 |
| Without a token (per address) | 120 |
| Refused tokens or keys (per address) | 30, then requests with a token from that address get 429 until the minute ends |

Every answer carries `x-ratelimit-limit`, `x-ratelimit-remaining` and `x-ratelimit-reset`
(seconds until the minute ends). Over the limit: 429 `rate_limited` with `retry-after` (seconds)
and `details: { limit, retryAfter }`; wait, then try again. Sending messages and reports has its
own, stricter limits (429 too). Sign-in has Better Auth's limits (see above). Admins see requests
per user and connection (7 days) and who went over a limit (last hour) under Admin → API.

## Endpoints

| Method | Path | Sign-in | What |
|--------|------|---------|------|
| GET | `/api/v1/me` | required | Account, profile, roles, settings |
| GET | `/api/v1/airports?q=` | – | Search European airfields |
| GET | `/api/v1/airports/{ident}` | – | One airfield |
| GET | `/api/v1/aircraft?airport=&radius=&from=&to=&…` | optional | Search listed aircraft (`eligible=true` needs sign-in) |
| GET | `/api/v1/aircraft/{id}` | optional | A listed aircraft, or one of your own |
| GET | `/api/v1/aircraft/{id}/availability?from=&to=` | optional | When it's busy (times and kinds; `pending` = unanswered request) |
| GET | `/api/v1/aircraft/{id}/eligibility?from=&to=` | required | "Can I rent this": `eligible` + reasons with a sentence in the user's language |
| GET | `/api/v1/bookings` | required | Your bookings as pilot and owner |
| POST | `/api/v1/bookings` | required | Request a booking (pilot). 403 `forbidden` + `details.reasons` if not eligible, 409 + `details.reason` (`not_free`…) |
| GET | `/api/v1/bookings/{id}` | required | One booking with its history |
| POST | `/api/v1/bookings/{id}/accept` | required | The owner accepts (`{ note }` optional) |
| POST | `/api/v1/bookings/{id}/decline` | required | The owner declines (`{ note, proposal: { from, to } }` optional) |
| POST | `/api/v1/bookings/{id}/cancel` | required | Pilot or owner cancels with `{ reason }`; `details.late` |

### Flight log (BKG-7, BKG-12…15)

All under `/api/v1/bookings/{id}/log`, signed in as the booking's pilot (entries) or owner
(correction, confirm). Every call answers with the whole log as it is now: check-out, legs, fuel
and oil, remarks, the `amount` (worked out on the server) and the `checks` (warnings such as
`wrongFuel`, `hobbsLong`, `fuelHigh`, `late`, `intoNext`; never blocks). Litres and UTC instants.

| Method | Path | What |
|--------|------|------|
| GET | `…/log` | The log |
| POST | `…/log` | Check-out (pilot, from 2 hours before). `{ recencyConfirmed: true }` when carrying passengers (FCL.060) |
| PUT | `…/log/checkout` | `{ hobbsStart, tachStart, fuelStartL, oilStartL, checkoutPhotoId? }` |
| POST / PUT / DELETE | `…/log/legs`, `…/log/legs/{legId}` | Legs; times must be in order (400 `details.reason: leg_order`, `fields.blockOff: ["not_before:engineStart"]`) |
| POST / PUT / DELETE | `…/log/uplifts`, `…/log/uplifts/{upliftId}` | Fuel or oil added (`kind`, `airport`, `quantityL`, `fuelType`/`oilGrade`, `price`, `paidBy`, `receiptId` from `POST /api/v1/documents`) |
| POST / DELETE | `…/log/remarks`, `…/log/remarks/{remarkId}` | Remarks and PIREPs |
| POST | `…/log/submit` | Check-in: the pilot sends it to the owner |
| POST | `…/log/correction` | `{ note }`: the owner asks for a correction |
| POST | `…/log/confirm` | The owner confirms; the booking is completed |

Booking errors carry `details.reason`, the same codes the website uses (`not_free`,
`not_open`, `booked_elsewhere`, `aircraft_grounded`, `lapl_passengers`…), for apps to show
their own text.

Calendar sync endpoints for partner systems are listed below.

### Messages, notifications, favourites, saved searches, reviews

| Method | Path | What |
|--------|------|------|
| GET | `/api/v1/conversations` | Your conversations (`unread`, last message) |
| POST | `/api/v1/conversations` | `{ aircraftId, bookingId?, body? }`: open (or find) the conversation about a booking or listing |
| GET | `/api/v1/conversations/{id}` | Its messages (`mine` true/false); marks them read |
| POST | `/api/v1/conversations/{id}/messages` | `{ body }`: send (429 when too many in a short time) |
| GET | `/api/v1/notifications` | Latest 50 with a `text` in the user's language, plus `unread` |
| POST | `/api/v1/notifications/read` | Mark all read |
| GET | `/api/v1/favourites` | Favourite aircraft |
| PUT / DELETE | `/api/v1/favourites/{aircraftId}` | Add / remove |
| GET / POST | `/api/v1/saved-searches` | Saved searches; `{ name, query, alerts }` where `query` is the search as a query string (`airport=LBSF&radius=50&from=2026-10-20T08:00`) |
| PATCH / DELETE | `/api/v1/saved-searches/{id}` | `{ alerts }` / remove |
| GET / POST | `/api/v1/bookings/{id}/reviews` | Your review and (once published) the other side's; `{ scores, comment }` to review |
| POST | `/api/v1/reviews/{id}/reply` | `{ text }`: the owner's one public reply |
| GET | `/api/v1/aircraft/{id}/reviews` | Published reviews of an aircraft (public) |

| POST | `/api/v1/documents` | Upload a private document (multipart, field `file`: PDF, JPEG, PNG, WebP, ≤ 4 MB) → `{ id, filename, sizeBytes }`; send the id with a credential, the check-out photo or a receipt. Uploads nothing refers to are removed after a day (413 too large, 409 `tooMany` over 50) |
| GET | `/api/v1/documents/{id}` | The file: yours, or a flight log photo/receipt of your booking (404 otherwise); `?download` |
| GET | `/api/v1/me/credentials` | Licences, ratings, medicals (status `pending`/`verified`/`rejected`, `usable`, `expiry`, scan), experience, hours per type, `summary` |
| POST | `/api/v1/me/credentials/{licences\|ratings\|medicals}` | Add one (an admin verifies it); licences and medicals need `documentId` |
| PUT / DELETE | `/api/v1/me/credentials/{kind}/{id}` | Change (all fields; a verified item goes back to pending) / remove with its scan |
| PUT | `/api/v1/me/credentials/experience` | `{ totalHours, picHours, last90DaysHours, birthDate? }` |
| PUT / DELETE | `/api/v1/me/credentials/type-hours/{aircraftType}` | `{ hours }` on an ICAO type (C172) / remove |

Changes to credentials answer with all of them as they are now.

**Your aircraft (owners, LST-1…8).** Quantities in SI units (`fuelBurnLph`, `usefulLoadKg`,
`mtomKg`); every change answers with the whole aircraft as it is now, including `gaps` (what still
stops the listing: `home_base`, `price`, `photo`, `arc`, `insurance`). Refusals carry
`details.reason`.

| Method | Path | What |
|--------|------|------|
| GET / POST | `/api/v1/me/aircraft` | Your aircraft / a new draft (`registration`, `manufacturer`, `model`, `typeDesignator`, `seats`, `fuelType` + any other field); 403 `owner_role_needed` |
| GET / PATCH / DELETE | `/api/v1/me/aircraft/{id}` | Everything about it / change any fields (`homeAirport`, `pricePerHour`, `nightVfr`…; 400 `registration_taken`, `unknown_airfield`) / delete (409 `has_bookings`) |
| PUT | `…/{id}/status` | `{ status: listed \| paused \| unlisted }`; 409 `not_ready` with `details.missing`, `blocked` (an admin unlisted it), `not_allowed` |
| PUT | `…/{id}/requirements` | Who may rent it: `licenceTypes`, `requiredRatings`, minimum hours/age/rating, `allowUnrated`, `checkoutFirstRental`, `instantBooking` |
| POST | `…/{id}/photos` | Add a photo (multipart `file`, JPEG/PNG/WebP ≤ 4 MB, at most 20) |
| PUT | `…/{id}/photos/order` | `{ order: [photoId…] }`, cover first |
| DELETE | `…/{id}/photos/{photoId}` | Remove (409 `last_photo` while listed) |
| POST | `…/{id}/documents` | `{ kind, title?, expiresOn?, documentId }`: CofA/ARC/insurance (an admin checks them; ARC and insurance need `expiresOn`) or POH/checklist/W&B for renters |
| PUT / DELETE | `…/{id}/documents/{documentId}` | Change title, expiry or file (same kind; 409 `add_renewal`) / remove (409 `cant_delete_listed`): add renewals as new documents |

Running the aircraft (BKG-7, BKG-8, BKG-15, SRC-5):

| Method | Path | What |
|--------|------|------|
| GET / POST | `…/{id}/calendar` | Bookings, your blocks and busy times from connected systems (`?from&to`, default 60 days) / block time `{ kind: owner_use \| maintenance \| unavailable, from, to, note }` (409 `overlaps`) |
| DELETE | `…/{id}/calendar/{entryId}` | Remove a block |
| POST | `…/{id}/ground` | Ground it; listing it again (`…/status`) checks everything again |
| GET / POST | `…/{id}/defects` | Reported defects / record one yourself `{ severity, description, photoId }` |
| POST | `…/{id}/defects/{defectId}/resolve` | `{ note }`: fixed |
| POST | `/api/v1/bookings/{id}/defects` | The pilot (or owner) reports a defect on a booking; the owner is emailed at once |
| GET | `…/{id}/remarks` | Pilots' remarks from flight logs |
| PUT | `…/{id}/remarks/{remarkId}` | `{ state: known \| resolved }`: a known item is shown to pilots of upcoming bookings |
| GET / POST | `…/{id}/meter-readings` | Hobbs/tach you recorded / `{ readAt, hobbs, tach, note }` (the next check-out is compared with it) |
| DELETE | `…/{id}/meter-readings/{readingId}` | Remove one recorded by mistake |

Still website-only: calendar sync settings (connections, webhooks), usage exports, account
settings and admin tools.

## Calendar sync for other booking systems (SYN-1…6, SYN-8)

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
| PUT | `/api/v1/sync/busy/{yourId}` | `{ "start": "…Z", "end": "…Z" }` (+ optional details below): create or move one booking; `"status": "cancelled"` removes it. **409 `conflict`** if it overlaps an ownAplane booking: it is still recorded, the owner is told to resolve it |
| DELETE | `/api/v1/sync/busy/{yourId}` | The booking was cancelled; the time is free again |
| PUT | `/api/v1/sync/busy` | `{ "busy": [ { "id", "start", "end" } ] }`: replace everything (a full snapshot); missing ids are removed. Returns the ids that conflict |

Statuses: `active` (blocks the aircraft), `covered` (the owner had already blocked that time),
`ignored` (cancelled, tentative while the owner takes the status, in the past or more than 400
days ahead), `conflict` (409, see above). A push for another aircraft (`registration`, when the
owner checks it) is refused with 400 `bad_request` (`fields.registration`); in a full snapshot
those ids come back in `wrongAircraft`, tentative ones in `ignored`.

### Optional details, chosen by the owner

By default only times are exchanged: start, end, our id and whether it's a booking (`kind`) out;
start, end and your id in. Per connection, the owner chooses more under **Data exchanged with this
system** (`calendar_connections.export_fields` / `import_fields`). Fields that aren't chosen are
left out of the response; anything you send that isn't chosen is ignored, so always sending
everything is fine.

**Sent to you** (`GET /api/v1/sync/busy` and the iCal link):

| Owner's choice | JSON field | In the iCal link |
|---|---|---|
| Type | `type`: `booking`, `owner_use`, `maintenance`, `unavailable` | SUMMARY "Maintenance", "Owner's use" |
| Booking status | `status`: `requested`, `accepted`, `in_progress`, `completed` | DESCRIPTION; requests are `STATUS:TENTATIVE` |
| Route | `route`: `{ departure, arrival }` (airport idents) | DESCRIPTION, LOCATION = departure |
| Pilot's name | `pilot`: `{ name }` | DESCRIPTION |
| Booking reference | `booking`: `{ id, url }` (the url opens for the owner) | DESCRIPTION, URL |
| Owner's notes on blocked time | `note` | DESCRIPTION |
| Aircraft registration | `registration` | DESCRIPTION |

Pilots' email addresses and phone numbers are never sent. Titles of other connected systems are
never passed on. iCal texts are in the owner's language.

**Taken from you** (push API, JSON link and iCal link):

| Owner's choice | Push API / JSON link | iCal link | Effect |
|---|---|---|---|
| Title | `title` (the first 200 characters are kept) | SUMMARY | Shown in the owner's calendar, only to the owner |
| Type | `type`: `booking` or `maintenance` | CATEGORIES containing "maintenance" | Shown as maintenance (pilots see the kind, never the title) |
| Status | `status`: `confirmed`, `tentative` (`cancelled` always removes it) | STATUS:TENTATIVE / CANCELLED | Tentative bookings don't block the aircraft |
| Aircraft registration | `registration` (case and dashes ignored) | — | Bookings for another aircraft are refused |

Example push with every optional field:

```json
{ "start": "2026-10-20T08:00:00Z", "end": "2026-10-20T11:00:00Z",
  "title": "Lesson, student 12", "type": "booking", "status": "confirmed", "registration": "LZ-ABC" }
```

**Avoiding double bookings both ways:** before your system confirms a booking, ask
`GET /api/v1/sync/busy` (or read our iCal link); after it confirms, `PUT` it at once. ownAplane
does the same in reverse: it refreshes linked calendars right before a request or acceptance, and
refuses an acceptance while another system has the time.

### Webhooks: we tell you about changes (SYN-6)

Instead of reading our busy times regularly, your system can get a call whenever one changes:
a booking, request or owner block of the aircraft is made, moved, cancelled, or changes status,
or another connected system's busy time changes. Your own busy times are never sent back.

| Method | Path | What |
|--------|------|------|
| PUT | `/api/v1/sync/webhook` | `{ "url": "https://…", "newSecret"?: true }`: send changes there. The first call (or `newSecret`) returns a **signing secret**, only once |
| GET | `/api/v1/sync/webhook` | The address, the last successful delivery and the last error |
| POST | `/api/v1/sync/webhook/test` | We send a `ping` now and answer `{ ok, error? }` |
| DELETE | `/api/v1/sync/webhook` | Stop sending changes |

The owner can also set the address in the app (Calendar sync → the connection → **Tell this
system about changes**) and give you the secret.

Each call is a `POST` with JSON and these headers:

- `ownaplane-event`: `busy.updated` (created or changed), `busy.deleted` (free again) or `ping`
- `ownaplane-signature`: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the secret>`

```json
{ "id": "5f0c…", "type": "busy.updated", "createdAt": "2026-10-20T07:12:03.000Z",
  "aircraft": { "id": "…", "registration": "LZ-ABC" },
  "busy": { "id": "…", "from": "2026-10-20T08:00:00.000Z", "to": "2026-10-20T11:00:00.000Z", "kind": "booking" } }
```

`busy` has the same shape as `GET /api/v1/sync/busy` (with the details the owner shares); for
`busy.deleted` it has only the `id`. Several quick changes to the same busy time may arrive as
one call with its latest state; use `busy.id` to update or remove it on your side.

**Check the signature** (Node.js):

```js
import { createHmac, timingSafeEqual } from "node:crypto";
function fromOwnAplane(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // older than 5 minutes
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(v1 ?? "", "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

Answer with any **2xx within 8 seconds**. Otherwise we try again after 1, 5, 15 and 60 minutes,
then 3, 6, 12 and 24 hours, and then give up (GET /sync/busy always has the full picture). The
address must be a public `https` address; redirects aren't followed.

### JSON link format

```json
{ "busy": [ { "id": "42", "start": "2026-10-20T08:00:00Z", "end": "2026-10-20T11:00:00Z" } ] }
```

A plain array works too, and `from`/`to` instead of `start`/`end`. Items may carry the optional
`title`, `type`, `status` and `registration` above; `"status": "cancelled"` items are skipped. Times are ISO 8601 with an
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
