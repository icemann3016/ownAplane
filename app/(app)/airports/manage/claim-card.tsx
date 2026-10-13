import { getTranslations } from "next-intl/server";

import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MyClaim } from "@/lib/airport-teams/claims";
import { cn } from "@/lib/utils";
import { withdrawClaimAction } from "./actions";
import { ClaimCodeForm } from "./claim-code-form";

const BADGE: Record<MyClaim["status"], string> = {
  unconfirmed: "border-warning/50 text-warning",
  pending: "text-muted-foreground",
  verified: "border-success/40 text-success",
  rejected: "border-destructive/40 text-destructive",
  withdrawn: "text-muted-foreground",
};

/** One of the user's claims: its status and what they can do next. */
export async function ClaimCard({
  claim,
  filedOn,
  decidedOn,
}: {
  claim: MyClaim;
  filedOn: string;
  decidedOn: string | null;
}) {
  const t = await getTranslations("airports");
  const open = claim.status === "unconfirmed" || claim.status === "pending";
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle as="h3" className="text-base">
            <span className="font-mono">{claim.airport.icaoCode ?? claim.airport.ident}</span>{" "}
            {claim.airport.name}
          </CardTitle>
          <Badge variant="outline" className={cn(BADGE[claim.status])}>
            {t(`claimStatus.${claim.status}`)}
          </Badge>
        </div>
        <CardDescription>
          {t("claimCard.filed", { date: filedOn, position: claim.position })} ·{" "}
          {claim.email
            ? t("claimCard.proofEmail", { email: claim.email })
            : t("claimCard.proofDocument")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {claim.status === "unconfirmed" && claim.email && (
          <ClaimCodeForm id={claim.id} email={claim.email} />
        )}
        {claim.status === "pending" && <p>{t("claimCard.pending")}</p>}
        {claim.status === "verified" && <p>{t("claimCard.verified", { date: decidedOn ?? "" })}</p>}
        {claim.status === "rejected" && (
          <div className="grid gap-1">
            <p className="text-destructive">
              {t("claimCard.rejected", { reason: claim.decisionNote ?? "" })}
            </p>
            <p className="text-muted-foreground">{t("claimCard.rejectedAgain")}</p>
          </div>
        )}
        {open && (
          <form action={withdrawClaimAction}>
            <input type="hidden" name="id" value={claim.id} />
            <SubmitButton variant="outline" size="sm" pendingText={t("claimCard.withdrawing")}>
              {t("claimCard.withdraw")}
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
