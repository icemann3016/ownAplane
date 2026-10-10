import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { photoUrl } from "@/lib/aircraft/queries";
import { asUser } from "@/lib/db/rls";
import { aircraft, aircraftPhotos, airports, favouriteAircraft } from "@/lib/db/schema";

// Favourite aircraft (SRC-6). RLS: each user sees and changes only their own, and can only
// favourite aircraft they may see.

export async function isFavourite(userId: string, aircraftId: string): Promise<boolean> {
  const rows = await asUser(userId, (tx) =>
    tx
      .select({ id: favouriteAircraft.aircraftId })
      .from(favouriteAircraft)
      .where(
        and(eq(favouriteAircraft.userId, userId), eq(favouriteAircraft.aircraftId, aircraftId)),
      ),
  );
  return rows.length > 0;
}

/** Add or remove a favourite; returns whether it is one now (false if the aircraft is hidden). */
export async function setFavourite(
  userId: string,
  aircraftId: string,
  favourite: boolean,
): Promise<boolean> {
  return asUser(userId, async (tx) => {
    if (!favourite) {
      await tx
        .delete(favouriteAircraft)
        .where(
          and(eq(favouriteAircraft.userId, userId), eq(favouriteAircraft.aircraftId, aircraftId)),
        );
      return false;
    }
    // The aircraft must be visible to the user (listed, or their own).
    const [visible] = await tx
      .select({ id: aircraft.id })
      .from(aircraft)
      .where(eq(aircraft.id, aircraftId));
    if (!visible) return false;
    await tx.insert(favouriteAircraft).values({ userId, aircraftId }).onConflictDoNothing();
    return true;
  });
}

/** The user's favourites, newest first, with what a list shows (hidden aircraft drop out). */
export async function listFavourites(userId: string) {
  const rows = await asUser(userId, (tx) =>
    tx
      .select({
        id: aircraft.id,
        registration: aircraft.registration,
        manufacturer: aircraft.manufacturer,
        model: aircraft.model,
        status: aircraft.status,
        pricePerHour: aircraft.pricePerHour,
        currency: aircraft.currency,
        airportCode: sql<string | null>`coalesce(${airports.icaoCode}, ${airports.ident})`,
        cover: sql<string | null>`(
          select ${aircraftPhotos.storageKey} from ${aircraftPhotos}
          where ${aircraftPhotos.aircraftId} = ${aircraft.id}
          order by ${aircraftPhotos.sortOrder}, ${aircraftPhotos.createdAt} limit 1)`,
        savedAt: favouriteAircraft.createdAt,
      })
      .from(favouriteAircraft)
      .innerJoin(aircraft, eq(aircraft.id, favouriteAircraft.aircraftId))
      .leftJoin(airports, eq(airports.ident, aircraft.homeAirportIdent))
      .where(eq(favouriteAircraft.userId, userId))
      .orderBy(desc(favouriteAircraft.createdAt))
      .limit(100),
  );
  return rows.map(({ cover, ...r }) => ({ ...r, coverUrl: photoUrl(cover) }));
}

export type Favourite = Awaited<ReturnType<typeof listFavourites>>[number];
