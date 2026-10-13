import { render, translator } from "./templates";

// Emails about airport teams (APT-1, M16).

/** The code that confirms an airport email address given as proof of a claim. */
export function airportClaimCodeEmail({
  name,
  locale,
  airport,
  code,
  url,
}: {
  name: string;
  locale?: string | null;
  airport: string;
  code: string;
  url: string;
}) {
  const t = translator(locale);
  return render({
    subject: t("airportCode.subject", { code }),
    greeting: t("airportCode.greeting", { name }),
    paragraphs: [t("airportCode.body", { airport, code }), t("airportCode.ignore")],
    cta: t("airportCode.cta"),
    url,
    locale,
  });
}

/** Sent to the claimant when an admin verifies or rejects their airport claim. */
export function airportClaimReviewedEmail({
  name,
  locale,
  airport,
  decision,
  reason,
  url,
}: {
  name: string;
  locale?: string | null;
  airport: string;
  decision: "verify" | "reject";
  reason?: string | null;
  url: string;
}) {
  const t = translator(locale);
  const verified = decision === "verify";
  return render({
    subject: t(verified ? "airportClaim.verifiedSubject" : "airportClaim.rejectedSubject", {
      airport,
    }),
    greeting: t("airportClaim.greeting", { name }),
    paragraphs: verified
      ? [t("airportClaim.verifiedBody", { airport })]
      : [
          t("airportClaim.rejectedBody", { airport }),
          t("airportClaim.reason", { reason: reason ?? "" }),
        ],
    cta: t("airportClaim.cta"),
    url,
    locale,
  });
}

/** A manager invites someone to an airfield's team. */
export function airportInviteEmail({
  locale,
  airport,
  inviter,
  url,
}: {
  locale?: string | null;
  airport: string;
  inviter: string;
  url: string;
}) {
  const t = translator(locale);
  return render({
    subject: t("airportInvite.subject", { airport }),
    greeting: t("airportInvite.greeting"),
    paragraphs: [t("airportInvite.body", { airport, inviter }), t("airportInvite.expires")],
    cta: t("airportInvite.cta"),
    url,
    locale,
  });
}
