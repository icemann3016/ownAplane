# Verification (admins)

Admins are made with `npm run admin:grant -- email@example.com` (and removed with `--revoke`); the
person must have signed up first.

- **Admin → Verifications** lists pilot credentials, aircraft documents and airport claims waiting
  for review.
- Open an item, look at the document and **Verify** or **Reject** with a reason (sent to the
  person).
- **Airport claims:** check that the document, or the email address's domain, really belongs to
  the airfield's operator and that the name matches the account. Verifying puts the airfield on
  ownAplane and makes the claimant a manager of its team (another manager, if it already has one).
- Admins can't review their own credentials, aircraft or airport claims.
- Every document an admin opens, and every decision, is written to the audit log.
- Reports, suspensions, unlisting and hiding reviews: see [Reports and moderation](/help/admin-moderation).
