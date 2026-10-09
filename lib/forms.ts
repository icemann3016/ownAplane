/** State returned by form Server Actions and read with useActionState. */
export type FormState = {
  ok?: boolean;
  message?: string;
  /** Machine-readable reason, e.g. "email_not_confirmed". */
  code?: string;
  errors?: Record<string, string[] | undefined>;
  /** Submitted values to refill the form after an error (never passwords). */
  values?: Record<string, string>;
  /** A secret shown to the user once, e.g. a new API key (never stored or logged). */
  secret?: string;
};

export const initialFormState: FormState = {};

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

export function withoutSecrets(values: Record<string, string>): Record<string, string> {
  const { password: _p, confirm: _c, currentPassword: _cp, token: _t, ...rest } = values;
  return rest;
}
