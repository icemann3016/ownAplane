import { HeartIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { SubmitButton } from "@/components/forms/submit-button";
import { isFavourite } from "@/lib/saved/favourites";
import { cn } from "@/lib/utils";
import { toggleFavourite } from "./favourite-actions";

/** Save the aircraft to the user's favourites, or remove it (SRC-6). */
export async function FavouriteButton({
  userId,
  aircraftId,
}: {
  userId: string;
  aircraftId: string;
}) {
  const t = await getTranslations("saved");
  const on = await isFavourite(userId, aircraftId);
  return (
    <form action={toggleFavourite}>
      <input type="hidden" name="aircraftId" value={aircraftId} />
      <input type="hidden" name="favourite" value={on ? "0" : "1"} />
      <SubmitButton variant="outline" size="sm">
        <HeartIcon aria-hidden className={cn(on && "fill-red-600 text-red-600")} />
        {on ? t("favourite.remove") : t("favourite.add")}
      </SubmitButton>
    </form>
  );
}
