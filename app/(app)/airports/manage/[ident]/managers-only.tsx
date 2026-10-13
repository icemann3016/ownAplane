import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** What staff see where only managers can change something. */
export async function ManagersOnly({ ident }: { ident: string }) {
  const t = await getTranslations("airports.profile");
  return (
    <p className="text-sm text-muted-foreground">
      {t("managersOnly")}{" "}
      <Link href={`/airports/${encodeURIComponent(ident)}`} className="underline">
        {t("viewPage")}
      </Link>
    </p>
  );
}
