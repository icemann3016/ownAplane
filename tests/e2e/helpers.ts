import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

export const PASSWORD = "blue-skies-2026";

export const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function inDays(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function signUp(page: Page, name: string, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
}

/**
 * Direct access to the throwaway test database, to prepare data that other tests already cover
 * through the UI (listing an aircraft, verifying credentials). Never used against real data.
 */
export async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => undefined });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

export const userId = (sql: postgres.Sql, email: string) =>
  sql<{ id: string }[]>`select id from users where email = ${email}`.then((r) => r[0]!.id);

/** A listed aircraft at LBSF owned by `ownerEmail` (skips the listing checks). */
export async function seedListedAircraft(ownerEmail: string, registration: string) {
  return withDb(async (sql) => {
    const owner = await userId(sql, ownerEmail);
    await sql`insert into user_roles (user_id, role) values (${owner}, 'owner') on conflict do nothing`;
    const [plane] = await sql<{ id: string }[]>`
      insert into aircraft (owner_id, registration, manufacturer, model, type_designator, seats,
        fuel_type, home_airport_ident, price_per_hour)
      values (${owner}, ${registration}, 'Cessna', '172S', 'C172', 4, 'avgas_100ll', 'LBSF', 180)
      returning id`;
    await sql.begin(async (tx) => {
      await tx`alter table aircraft disable trigger aircraft_check_status`;
      await tx`update aircraft set status = 'listed' where id = ${plane!.id}`;
      await tx`alter table aircraft enable trigger aircraft_check_status`;
    });
    return plane!.id;
  });
}

/** A PPL(A) with a Class 2 medical and SEP (land), all verified. */
export async function seedVerifiedPilot(email: string) {
  await withDb(async (sql) => {
    const pilot = await userId(sql, email);
    await sql`insert into pilot_licences (user_id, type, issuing_state, number, status)
      values (${pilot}, 'ppl_a', 'BG', 'BG.E2E', 'verified')`;
    await sql`insert into medicals (user_id, class, issuing_state, valid_until, status)
      values (${pilot}, 'class2', 'BG', '2099-01-01', 'verified')`;
    await sql`insert into pilot_ratings (user_id, kind, code, status)
      values (${pilot}, 'class', 'SEP_LAND', 'verified')`;
  });
}

/**
 * An accepted booking of `aircraftId` by the pilot, starting in `startsIn` minutes and lasting 3
 * hours. Night VFR is allowed so the test works at any time of day.
 */
export async function seedAcceptedBooking(aircraftId: string, pilotEmail: string, startsIn = 30) {
  return withDb(async (sql) => {
    const pilot = await userId(sql, pilotEmail);
    await sql`update aircraft set night_vfr = true where id = ${aircraftId}`;
    await sql`insert into pilot_ratings (user_id, kind, code, status)
      values (${pilot}, 'privilege', 'NIGHT', 'verified')`;
    const [{ owner }] = await sql<{ owner: string }[]>`
      select owner_id as owner from aircraft where id = ${aircraftId}`;
    const from = new Date(Date.now() + startsIn * 60_000).toISOString();
    const to = new Date(Date.now() + (startsIn + 180) * 60_000).toISOString();
    return sql.begin(async (tx) => {
      await tx`select set_config('app.user_id', ${pilot}, true)`;
      const [{ id }] = await tx<{ id: string }[]>`
        select public.request_booking(${aircraftId}::uuid, tstzrange(${from}, ${to}),
          'LBSF', 'LBSF', '{}'::text[], 'local', 0, 1.5, null, 270) as id`;
      await tx`select set_config('app.user_id', ${owner}, true)`;
      await tx`select public.respond_to_booking(${id}::uuid, 'accept')`;
      return id;
    });
  });
}

/** An accepted booking whose flight log the owner has just confirmed (reviews can be written). */
export async function seedCompletedBooking(aircraftId: string, pilotEmail: string) {
  const id = await seedAcceptedBooking(aircraftId, pilotEmail);
  await withDb(async (sql) => {
    await sql`update bookings set status = 'completed' where id = ${id}`;
    await sql`insert into flight_logs (booking_id, status, confirmed_at)
      values (${id}, 'confirmed', now())`;
  });
  return id;
}

/**
 * Sign in like the mobile app (token in `set-auth-token`). Sign-in is rate-limited per address,
 * and tests run in parallel, so a 429 waits for the window to pass and tries again.
 */
export async function apiSignIn(baseURL: string | undefined, email: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(new URL("/api/auth/sign-in/email", baseURL), {
      method: "POST",
      headers: { origin: "ownaplane://app", "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (res.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      continue;
    }
    const token = res.headers.get("set-auth-token");
    if (res.status !== 200 || !token) throw new Error(`sign-in failed: ${res.status}`);
    return token;
  }
  throw new Error("sign-in kept being rate-limited");
}

/**
 * An airfield on ownAplane run by `managerEmail`, with landing charges in two weight bands,
 * AVGAS by the litre and customs on request (APT-1/2).
 */
export async function seedAirfield(
  ident: string,
  name: string,
  managerEmail: string,
  ppr: boolean,
) {
  await withDb(async (sql) => {
    const [{ id }] = await sql<
      { id: string }[]
    >`select id from users where email = ${managerEmail}`;
    await sql`insert into airports (ident, type, name, country, latitude, longitude, timezone)
      values (${ident}, 'small_airport', ${name}, 'BG', 42.9, 25.3, 'Europe/Sofia')`;
    await sql`insert into airport_operators (airport_ident, ppr_required, ppr_notice_hours)
      values (${ident}, ${ppr}, ${ppr ? 2 : null})`;
    await sql`insert into airport_members (airport_ident, user_id, role)
      values (${ident}, ${id}, 'manager')`;
    await sql`insert into airport_services (airport_ident, category, fuel_type, max_mtom_kg, price, unit)
      values (${ident}, 'landing', null, 1000, 15, 'landing'),
             (${ident}, 'landing', null, 2000, 25, 'landing'),
             (${ident}, 'fuel', 'avgas_100ll', null, 2.859, 'litre'),
             (${ident}, 'customs', null, null, null, 'once')`;
  });
}
