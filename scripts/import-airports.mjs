#!/usr/bin/env node
/**
 * Import European airfields from OurAirports (https://ourairports.com/data/, public domain)
 * into the airports table, with their runways and radio frequencies. Safe to re-run: airports
 * are updated; runways and frequencies are replaced, except at airfields with a team on
 * ownAplane, which keep their own (M16).
 *
 *   npm run airports:import                          # download the latest data
 *   npm run airports:import -- --file some.csv       # use a local CSV (tests, offline): airports
 *     [--runways runways.csv] [--frequencies freqs.csv]   only, unless these are given too
 *
 * Uses DATABASE_URL_MIGRATIONS or DATABASE_URL from .env.local.
 */
import { readFile } from "node:fs/promises";

import nextEnv from "@next/env";
import tzLookup from "@photostructure/tz-lookup";
import { parse } from "csv-parse/sync";
import postgres from "postgres";

import { shouldImport, toAirportRow, toFrequencyRow, toRunwayRow } from "./airports/transform.mjs";

const DATA = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main";
const SOURCE_URL = `${DATA}/airports.csv`;
const BATCH = 500;

nextEnv.loadEnvConfig(process.cwd());
const lookupTimezone = tzLookup.default ?? tzLookup;

const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};

async function download(url) {
  console.log(`Downloading ${url} …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  return res.text();
}

async function loadCsv() {
  const file = flag("--file");
  return file ? readFile(file, "utf8") : download(SOURCE_URL);
}

/** Runways or frequencies: a local file, a download, or nothing when importing a local file. */
async function loadExtra(name, remote) {
  const file = flag(name);
  if (file) return readFile(file, "utf8");
  return flag("--file") ? null : download(`${DATA}/${remote}`);
}

/**
 * Replace the open-data rows of airfields without a team (teams keep their own) with `rows`.
 */
async function replaceRows(sql, table, rows) {
  await sql.begin(async (tx) => {
    await tx`delete from ${tx(table)}
      where airport_ident not in (select airport_ident from airport_operators)`;
    const columns = rows.length ? Object.keys(rows[0]) : [];
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx`insert into ${tx(table)} ${tx(rows.slice(i, i + BATCH), columns)}`;
    }
  });
  console.log(`  ${rows.length} ${table.replace("airport_", "")} of airfields without a team.`);
}

async function main() {
  const url = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");

  const records = parse(await loadCsv(), { columns: true, skip_empty_lines: true });
  const rows = records.filter((r) => shouldImport(r)).map((r) => toAirportRow(r, lookupTimezone));
  console.log(
    `${records.length} airports in the file, ${rows.length} European airfields to import.`,
  );

  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const columns = Object.keys(rows[0]);
    const updates = columns.filter((c) => c !== "ident");
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await sql`
        insert into airports ${sql(batch, columns)}
        on conflict (ident) do update set
          ${sql.unsafe(updates.map((c) => `${c} = excluded.${c}`).join(", "))},
          updated_at = now()
      `;
      process.stdout.write(`\r  ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
    }
    const [{ count }] = await sql`select count(*)::int as count from airports`;
    console.log(`\nDone. The airports table now has ${count} airfields.`);

    const imported = new Set(rows.map((r) => r.ident));
    const operated = new Set(
      (await sql`select airport_ident from airport_operators`).map((r) => r.airport_ident),
    );
    const open = (r) => r && imported.has(r.airport_ident) && !operated.has(r.airport_ident);
    const runways = await loadExtra("--runways", "runways.csv");
    if (runways) {
      const parsed = parse(runways, { columns: true, skip_empty_lines: true });
      await replaceRows(sql, "airport_runways", parsed.map(toRunwayRow).filter(open));
    }
    const frequencies = await loadExtra("--frequencies", "airport-frequencies.csv");
    if (frequencies) {
      const parsed = parse(frequencies, { columns: true, skip_empty_lines: true });
      await replaceRows(sql, "airport_frequencies", parsed.map(toFrequencyRow).filter(open));
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("\nImport failed:", error.message);
  process.exit(1);
});
