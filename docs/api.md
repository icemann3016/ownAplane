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

Next (M12–M13): booking actions, flight log, messages, notifications, calendar sync (iCal links
and a push API for partner systems).

## For developers of this repo

- Endpoints live in `app/api/v1/**/route.ts` and stay thin: `apiRoute(async (request) => …)`,
  check the token with `requireApiUser()` / `optionalApiUser()`, validate input with a schema
  from `lib/api/schemas.ts`, call the same `lib/` functions the website uses, and return a DTO
  from `lib/api/dto.ts`.
- Every DTO returns a type from `lib/api/responses.ts`; the OpenAPI description
  (`lib/api/openapi.ts`) is built from those schemas, so add new endpoints there too.
- Guards in `npm test` (`lib/api/routes.test.ts`): every endpoint uses `apiRoute` and checks the
  token unless it's on the short public list. Browser tests: `tests/e2e/api.spec.ts`.
