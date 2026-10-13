import { z } from "zod";

// Airport claims and teams (APT-1). Messages are keys in messages/*.json → "validation".

export const claimSchema = z
  .object({
    airport: z.string().trim().min(1, "airportUnknown").max(20, "airportUnknown"),
    position: z.string().trim().min(1, "fieldRequired").max(80, "textTooLong"),
    note: z.string().trim().max(500, "textTooLong").optional().default(""),
    proof: z.enum(["document", "email"]),
    documentId: z.string().optional().default(""),
    email: z.string().trim().max(200, "emailInvalid").optional().default(""),
  })
  .superRefine((d, ctx) => {
    if (d.proof === "document" && !z.uuid().safeParse(d.documentId).success) {
      ctx.addIssue({ code: "custom", path: ["documentId"], message: "documentRequired" });
    }
    if (d.proof === "email" && !z.email().safeParse(d.email).success) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "emailInvalid" });
    }
  });

export const claimCodeSchema = z.object({
  id: z.uuid(),
  code: z
    .string()
    .trim()
    .regex(/^\d{3}\s?\d{3}$/, "invalid"),
});

export const inviteSchema = z.object({
  ident: z.string().min(1).max(20),
  email: z.email("emailInvalid").trim().max(200, "emailInvalid"),
  role: z.enum(["manager", "staff"]),
});
