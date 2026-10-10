import { eq, inArray } from "drizzle-orm";

import { getUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  accounts,
  aircraft,
  aircraftDocuments,
  aircraftPhotos,
  documents,
  experienceByType,
  favouriteAircraft,
  medicals,
  messages,
  pilotExperience,
  pilotLicences,
  pilotRatings,
  profiles,
  rentalRequirements,
  reviews,
  savedSearches,
  sessions,
  userRoles,
  userSettings,
  users,
} from "@/lib/db/schema";

/**
 * "Download my data" (GDPR): everything we store about the logged-in user, as JSON.
 * Secrets (password hashes, OAuth tokens, session tokens) are left out on purpose.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please log in again." }, { status: 401 });

  const db = getDb();
  const [account] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, user.id));
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
  const roles = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
  const loginMethods = await db
    .select({
      provider: accounts.providerId,
      accountId: accounts.accountId,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(eq(accounts.userId, user.id));
  const activeSessions = await db
    .select({
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(eq(sessions.userId, user.id));

  const pilot = {
    licences: await db.select().from(pilotLicences).where(eq(pilotLicences.userId, user.id)),
    ratings: await db.select().from(pilotRatings).where(eq(pilotRatings.userId, user.id)),
    medicals: await db.select().from(medicals).where(eq(medicals.userId, user.id)),
    experience:
      (await db.select().from(pilotExperience).where(eq(pilotExperience.userId, user.id)))[0] ??
      null,
    hoursByType: await db
      .select()
      .from(experienceByType)
      .where(eq(experienceByType.userId, user.id)),
    // The files themselves can be opened from the pilot credentials page.
    documents: await db
      .select({
        id: documents.id,
        filename: documents.filename,
        contentType: documents.contentType,
        sizeBytes: documents.sizeBytes,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.ownerId, user.id)),
  };

  const myAircraft = await db.select().from(aircraft).where(eq(aircraft.ownerId, user.id));
  const aircraftIds = myAircraft.map((a) => a.id);
  const owner = {
    aircraft: myAircraft,
    photos: aircraftIds.length
      ? await db
          .select()
          .from(aircraftPhotos)
          .where(inArray(aircraftPhotos.aircraftId, aircraftIds))
      : [],
    documents: aircraftIds.length
      ? await db
          .select()
          .from(aircraftDocuments)
          .where(inArray(aircraftDocuments.aircraftId, aircraftIds))
      : [],
    rentalRequirements: aircraftIds.length
      ? await db
          .select()
          .from(rentalRequirements)
          .where(inArray(rentalRequirements.aircraftId, aircraftIds))
      : [],
  };

  const data = {
    exportedAt: new Date().toISOString(),
    account,
    profile,
    settings,
    roles: roles.map((r) => ({ role: r.role, since: r.createdAt })),
    loginMethods,
    sessions: activeSessions,
    pilot,
    owner,
    reviewsWritten: await db
      .select({
        bookingId: reviews.bookingId,
        direction: reviews.direction,
        scores: reviews.scores,
        overall: reviews.overall,
        comment: reviews.comment,
        submittedAt: reviews.submittedAt,
        publishedAt: reviews.publishedAt,
        reply: reviews.reply,
      })
      .from(reviews)
      .where(eq(reviews.authorId, user.id)),
    messagesSent: await db
      .select({
        conversationId: messages.conversationId,
        body: messages.body,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.senderId, user.id)),
    favouriteAircraft: await db
      .select({ aircraftId: favouriteAircraft.aircraftId, savedAt: favouriteAircraft.createdAt })
      .from(favouriteAircraft)
      .where(eq(favouriteAircraft.userId, user.id)),
    savedSearches: await db
      .select({
        name: savedSearches.name,
        query: savedSearches.query,
        alerts: savedSearches.alerts,
        createdAt: savedSearches.createdAt,
      })
      .from(savedSearches)
      .where(eq(savedSearches.userId, user.id)),
  };
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="ownaplane-data-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
