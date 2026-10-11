"use client";

import { type ReactNode, useActionState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { billingAdmin } from "@/app/(app)/admin/billing-actions";

/** One admin billing operation (grant, revoke, credits, beta, cut-off) with its message. */
export function BillingForm({
  op,
  fields,
  hidden,
  label,
  variant = "default",
  className,
}: {
  op: string;
  fields?: ReactNode;
  hidden?: Record<string, string>;
  label: string;
  variant?: "default" | "outline" | "destructive";
  className?: string;
}) {
  const [state, action] = useActionState(billingAdmin, initialFormState);
  return (
    <form action={action} className={cn("grid gap-3", className)}>
      <input type="hidden" name="op" value={op} />
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields}
      <FormMessage state={state} />
      <SubmitButton variant={variant} size="sm" className="justify-self-start">
        {label}
      </SubmitButton>
    </form>
  );
}
