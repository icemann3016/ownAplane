# Private beta (KAN-73)

Goal: 10–20 owners in Bulgaria list real aircraft, and their club pilots book them, before the
public launch. Collect what's confusing and what's missing.

## Before inviting anyone

- [ ] Production checklist in `docs/deployment.md` done (backups, real email, monitoring).
- [ ] Terms and privacy reviewed by the lawyer; company details filled in (`content/legal`).
- [ ] At least two admins (`npm run admin:grant -- email`) to verify documents within a day.
- [ ] Demo data **not** on production (it's for demos on a separate database). To try the
      check-out and check-in on production, admins use **Admin → Practice** instead: a hidden
      practice aircraft per admin, removable with one click.
- [ ] **Remove the test accounts before inviting real users** (Admin → Members, search
      `test.ownaplane.eu`, delete each): `pilot@`, `owner@` (listed test aircraft ZZ-IFR, ZZ-VFR,
      ZZ-MEP) and `airport@` (manager of the made-up airfield OAP-TEST). They were added on
      2026-10-13 for testing on the live site (migration `0083_test_accounts.sql`; the password is
      not in git). The airfield OAP-TEST stays in the airport list without a page.

## Demo data for presentations

```bash
npm run demo:seed -- --yes            # owners, pilots, aircraft, bookings, reviews, messages
npm run demo:seed -- --remove --yes   # remove it again
```

Accounts end in `@demo.ownaplane.eu` (e.g. `owner.maria@…`, `pilot.elena@…`), password
`demo-flight-2026` or `DEMO_PASSWORD`. Demo aircraft have no photos or documents.

## Onboarding an owner (30 minutes, ideally in person)

1. Sign up together; switch on the owner role; add a photo and home airfield.
2. List the aircraft: details, photos, CofA/ARC/insurance, price, requirements, cancellation
   policy. An admin verifies the documents the same day.
3. Block the owner's own flights and maintenance in the calendar.
4. Show the booking flow from the pilot side with a club pilot: request → accept → flight log →
   confirm → reviews.
5. Point to the Help section (`/help`) and the Messages page.

## Feedback

- A short call after the first completed booking: what was hard, what was missing, would they
  recommend it to another owner?
- Admin dashboard (`/admin`): requests, acceptance rate, cancellations, reports each week.
- Keep a list of requests in Jira with the label `beta-feedback`.
