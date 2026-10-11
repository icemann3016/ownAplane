"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { readCredentialScan } from "@/lib/ocr/credentials";
import { saveCredential } from "@/lib/pilot/credential-ops";
import { getPilotCredentials } from "@/lib/pilot/credentials";
import { RATING_KINDS } from "@/lib/pilot/catalog";
import { ratingCodeValid } from "@/lib/validation/pilot";

// Reading a licence or medical scan into the credential form (VER-9). The pilot checks what was
// read before saving; ratings found on a licence are added only when the pilot picks them.

export type FoundRating = {
  kind: (typeof RATING_KINDS)[number];
  code: string;
  expiresOn: string | null;
};

export type ScanReadState =
  | { ok: true; values: Record<string, string>; ratings: FoundRating[] }
  | { ok: false; message: string };

const readInput = z.object({
  kind: z.enum(["licence", "medical"]),
  documentId: z.uuid(),
  consent: z.boolean(),
});

/** Read the uploaded scan; for a medical only with the pilot's consent. */
export async function readScanIntoForm(input: {
  kind: "licence" | "medical";
  documentId: string;
  consent: boolean;
}): Promise<ScanReadState> {
  const user = await requireUser("/account/credentials");
  const t = await getTranslations("pilot.scan");
  const parsed = readInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("errors.not_found") };
  const { kind, documentId, consent } = parsed.data;
  const read = await readCredentialScan(user.id, documentId, kind, consent ? new Date() : null);
  if (!read.ok) return { ok: false, message: t(`errors.${read.error}`) };
  const str = (v: string | null) => v ?? "";
  if (read.kind === "medical") {
    const s = read.suggestion;
    return {
      ok: true,
      values: {
        class: str(s.class),
        issuingState: str(s.issuingState),
        validUntil: str(s.validUntil),
      },
      ratings: [],
    };
  }
  const s = read.suggestion;
  const have = new Set(
    (await getPilotCredentials(user.id)).ratings.map((r) => `${r.kind}:${r.code}`),
  );
  return {
    ok: true,
    values: {
      type: str(s.type),
      issuingState: str(s.issuingState),
      number: str(s.number),
      issuedOn: str(s.issuedOn),
      expiresOn: str(s.expiresOn),
    },
    ratings: s.ratings.filter((r) => !have.has(`${r.kind}:${r.code}`)),
  };
}

const ratingsInput = z.object({
  documentId: z.uuid(),
  ratings: z
    .array(
      z.object({
        kind: z.enum(RATING_KINDS),
        code: z.string().regex(/^[A-Z0-9_]{2,20}$/),
        expiresOn: z.iso.date().nullable(),
      }),
    )
    .min(1)
    .max(20),
});

/** Add the ratings the pilot picked from the licence; each waits for an admin like any other. */
export async function addRatingsFromScan(input: {
  documentId: string;
  ratings: FoundRating[];
}): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser("/account/credentials");
  const t = await getTranslations("pilot.scan");
  const parsed = ratingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("errors.failed") };
  const have = new Set(
    (await getPilotCredentials(user.id)).ratings.map((r) => `${r.kind}:${r.code}`),
  );
  let added = 0;
  for (const r of parsed.data.ratings) {
    if (!ratingCodeValid(r.kind, r.code) || have.has(`${r.kind}:${r.code}`)) continue;
    const saved = await saveCredential(user.id, "rating", undefined, {
      ...r,
      documentId: parsed.data.documentId,
    });
    if (saved.ok) added += 1;
  }
  revalidatePath("/account/credentials");
  revalidatePath("/dashboard");
  return { ok: added > 0, message: t("ratingsAdded", { count: added }) };
}
