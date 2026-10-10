import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth/session";
import { listFavourites } from "@/lib/saved/favourites";
import { listSavedSearches } from "@/lib/saved/searches";
import { FavouritesCard } from "./favourites-card";
import { SearchesCard } from "./searches-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("saved");
  return { title: t("title") };
}

/** Favourite aircraft and saved searches with alerts (SRC-6). */
export default async function SavedPage() {
  const user = await requireUser("/saved");
  const t = await getTranslations("saved");
  const [favourites, searches] = await Promise.all([
    listFavourites(user.id),
    listSavedSearches(user.id),
  ]);
  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 px-4 py-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <FavouritesCard favourites={favourites} />
      <SearchesCard searches={searches} />
    </div>
  );
}
