import { requireApiUser } from "@/lib/api/auth";
import { apiRoute, bodyOf, json, parse, queryOf } from "@/lib/api/http";
import {
  logbookEntryBody,
  logbookEntryDto,
  logbookError,
  newLogbookEntryBody,
  pageQuery,
} from "@/lib/api/logbook";
import { getEntry, listEntries } from "@/lib/logbook/entries";
import { createEntry } from "@/lib/logbook/ops";

/** GET /api/v1/me/logbook?page: the pilot's entries, newest first, 50 a page (LOG-1). */
export const GET = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const { page } = parse(pageQuery, queryOf(request));
  const { entries, hasMore } = await listEntries(user.id, page);
  return json({
    data: entries.map(logbookEntryDto),
    nextCursor: hasMore ? String(page + 1) : null,
  });
});

/**
 * POST /api/v1/me/logbook: a new draft (flight, simulator session or totals brought forward),
 * or with `correctsId` a correction of a certified entry. Certify it with …/certify.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireApiUser(request);
  const body = await bodyOf(request);
  const values = parse(logbookEntryBody, body);
  const { correctsId } = parse(newLogbookEntryBody, body);
  const created = await createEntry(user.id, values, correctsId);
  if (!created.ok) throw logbookError(created);
  const found = await getEntry(user.id, created.id);
  return json({ data: logbookEntryDto(found!.entry) }, { status: 201 });
});
