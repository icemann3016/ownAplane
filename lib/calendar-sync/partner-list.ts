// Partners whose own API we read with the owner's key (SYN-7). Adding one: its entry below, a
// reader in lib/calendar-sync/partners.ts, and its id in the calendar_connections_partner check
// (a migration). Shared by the forms and the sync code.

export const PARTNERS = ["rafaviation"] as const;
export type Partner = (typeof PARTNERS)[number];

export const isPartner = (v: unknown): v is Partner => PARTNERS.includes(v as Partner);

export const PARTNER_INFO: Record<
  Partner,
  {
    name: string;
    /** Where the owner gets the API key. */
    site: string;
    /** The aircraft whose bookings the partner shares (its API covers only these). */
    registrations: readonly string[];
  }
> = {
  rafaviation: {
    name: "RAF Aviation",
    site: "https://rafaviation.flights",
    registrations: ["EC-IDR"],
  },
};
