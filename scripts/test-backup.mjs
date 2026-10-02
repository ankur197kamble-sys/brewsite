/**
 * Proves backups can actually be restored. Needs no dev server.
 *
 * Usage:
 *   npm run test:backup
 *
 * Works on two throwaway "[test] Backup …" cafés and a temporary schema (a
 * copy of the table structure, foreign keys and id counters), all removed
 * afterwards. It checks café #1 is byte-for-byte unchanged by every step.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { BACKUP_DIR, TABLES } from "./lib/backup-core.mjs";

const sql = neon(process.env.DATABASE_URL);
const run = randomBytes(3).toString("hex");
const work = mkdtempSync(join(tmpdir(), "brewsite-backup-test-"));
const testSchema = `bs_restore_test_${run}`;
const scriptsDir = resolve("scripts");
let passed = 0;
const failures = [];
const testCafeIds = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function cli(script, args, { env = {}, cwd } = {}) {
  const result = spawnSync(process.execPath, [join(scriptsDir, script), ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    cwd,
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

/** Everything about one café, exactly as Postgres stores it. */
async function snapshot(cafeId, schema = "public") {
  const [cafe] = await sql.query(`SELECT to_jsonb(c) AS row FROM ${schema}.cafes c WHERE id = $1`, [cafeId]);
  const content = {};
  for (const table of ["menu_categories", "menu_items", "gallery_images", "offers"]) {
    content[table] = (await sql.query(`SELECT to_jsonb(t) AS row FROM ${schema}.${table} t WHERE cafe_id = $1 ORDER BY id`, [cafeId])).map((r) => r.row);
  }
  return JSON.stringify({ cafe: cafe?.row ?? null, content });
}

async function createCafe(label) {
  const [cafe] = await sql.query(`INSERT INTO cafes (name) VALUES ($1) RETURNING id`, [`[test] Backup ${label} ${run}`]);
  testCafeIds.push(cafe.id);
  return cafe.id;
}

async function main() {
  /* ----------------------------------------------------------- setup */
  const testCafeId = await createCafe("main");
  await sql.query(
    `UPDATE cafes SET highlights = 'Fresh brews', tagline = 'A tagline', phone = '+91 98765 43210',
     address = '["Shop 1","Road"]', hours = '["Mon · 9-5"]', founded_year = 2021 WHERE id = $1`,
    [testCafeId],
  );
  const [coffee] = await sql.query(`INSERT INTO menu_categories (cafe_id, name, sort_order) VALUES ($1, 'Coffee', 0) RETURNING id`, [testCafeId]);
  const [food] = await sql.query(`INSERT INTO menu_categories (cafe_id, name, sort_order) VALUES ($1, 'Food', 1) RETURNING id`, [testCafeId]);
  await sql.query(
    `INSERT INTO menu_items (cafe_id, category_id, name, price, sort_order, is_published) VALUES
     ($1, $2, 'Latte', 249.50, 0, true), ($1, $2, 'Mocha', 199, 1, false), ($1, $3, 'Toast', 159, 0, true)`,
    [testCafeId, coffee.id, food.id],
  );
  await sql.query(
    `INSERT INTO gallery_images (cafe_id, url, alt, sort_order) VALUES
     ($1, 'https://images.unsplash.com/photo-a', 'Counter', 0), ($1, 'https://images.unsplash.com/photo-b', NULL, 1)`,
    [testCafeId],
  );
  await sql.query(
    `INSERT INTO offers (cafe_id, title, value, start_date, end_date, sort_order) VALUES
     ($1, 'Weekend deal', '20% off', '2026-01-01', '2099-12-31', 0), ($1, 'No dates', NULL, NULL, NULL, 1)`,
    [testCafeId],
  );
  // So the logins and uploads tables are exercised too, not compared empty.
  await sql.query(`INSERT INTO users (cafe_id, email, password_hash) VALUES ($1, $2, 'scrypt:test:test')`, [testCafeId, `backup-${run}@brewsite.test`]);
  await sql.query(
    `INSERT INTO uploads (cafe_id, key, url, content_type, size_bytes) VALUES ($1, $2, 'https://example.test/x.webp', 'image/webp', 1234)`,
    [testCafeId, `cafes/${testCafeId}/test-${run}.webp`],
  );

  // A second café whose row ids the clash test borrows, so café #1 is never involved.
  const otherCafeId = await createCafe("other");
  const [otherCategory] = await sql.query(`INSERT INTO menu_categories (cafe_id, name) VALUES ($1, 'Other') RETURNING id`, [otherCafeId]);
  const [otherItem] = await sql.query(
    `INSERT INTO menu_items (cafe_id, category_id, name, price) VALUES ($1, $2, 'Other item', 100) RETURNING id`,
    [otherCafeId, otherCategory.id],
  );

  const original = await snapshot(testCafeId);
  const realCafeBefore = await snapshot(1);

  /* ---------------------------------------------------------- backup */
  console.log("\nBackup");
  const backupFile = join(work, "backup.json");
  let result = cli("backup.mjs", ["--out", backupFile]);
  check("backup command succeeds", result.code === 0, result.out);
  const backup = JSON.parse(readFileSync(backupFile, "utf8"));
  const [{ tables: liveTables }] = await sql.query(
    `SELECT array_agg(table_name::text ORDER BY table_name) AS tables FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'sessions'`,
  );
  check("every database table except sessions is backed up", JSON.stringify([...TABLES].sort()) === JSON.stringify(liveTables), `${liveTables}`);
  check("login sessions are excluded", !("sessions" in backup.tables));
  check("id counters are recorded", TABLES.every((table) => Number.isInteger(backup.sequences?.[table])), JSON.stringify(backup.sequences));
  const offer = backup.tables.offers.rows.find((row) => row.cafe_id === testCafeId && row.title === "Weekend deal");
  check("calendar dates stay exact (no time-zone shift)", offer?.end_date === "2099-12-31" && offer?.start_date === "2026-01-01", JSON.stringify(offer));
  const latte = backup.tables.menu_items.rows.find((row) => row.cafe_id === testCafeId && row.name === "Latte");
  check("prices keep their value", Number(latte?.price) === 249.5, JSON.stringify(latte?.price));
  check("timestamps keep their time zone", /[+-]\d\d:\d\d$|Z$/.test(latte?.created_at ?? ""), latte?.created_at);
  check("no database address in the file", !readFileSync(backupFile, "utf8").includes("postgres"));

  const before = new Set(existsSync(BACKUP_DIR) ? readdirSync(BACKUP_DIR) : []);
  result = cli("backup.mjs", [], { cwd: work });
  const created = (existsSync(BACKUP_DIR) ? readdirSync(BACKUP_DIR) : []).filter((name) => !before.has(name));
  check("run from another folder, the backup still lands in the private backups/ folder", result.code === 0 && created.length === 1, result.out);
  for (const name of created) rmSync(join(BACKUP_DIR, name));

  /* ------------------------------------------------ simulate mistakes */
  async function damage() {
    await sql.query(`UPDATE cafes SET name = 'Oops renamed', hours = NULL WHERE id = $1`, [testCafeId]);
    await sql.query(`DELETE FROM menu_items WHERE cafe_id = $1 AND name = 'Toast'`, [testCafeId]);
    await sql.query(`DELETE FROM menu_categories WHERE cafe_id = $1 AND name = 'Food'`, [testCafeId]);
    await sql.query(`UPDATE menu_items SET price = 1, is_published = true WHERE cafe_id = $1 AND name = 'Mocha'`, [testCafeId]);
    await sql.query(`DELETE FROM gallery_images WHERE cafe_id = $1 AND alt = 'Counter'`, [testCafeId]);
    await sql.query(`INSERT INTO offers (cafe_id, title) VALUES ($1, 'Added after backup')`, [testCafeId]);
  }
  await damage();
  const damaged = await snapshot(testCafeId);
  check("(setup) the test café really changed", damaged !== original);

  /* --------------------------------------------------- restore --cafe */
  console.log("\nRestore one café");
  result = cli("restore.mjs", [backupFile, "--cafe", String(testCafeId)]);
  check("preview succeeds", result.code === 0, result.out);
  check("preview lists what comes back", result.out.includes("brought back") && result.out.includes("Toast"), result.out);
  check("preview changes nothing", (await snapshot(testCafeId)) === damaged);

  const safetyDir = join(work, "safety");
  result = cli("restore.mjs", [backupFile, "--cafe", String(testCafeId), "--apply", "--safety-dir", safetyDir], {
    env: { BREWSITE_TEST_EDIT_DURING_RESTORE: "1" },
  });
  check("an edit made during the restore cancels it", result.code === 1 && result.out.includes("data changed while restoring"), result.out);
  const afterCancelled = await snapshot(testCafeId);
  check("the cancelled restore changed nothing (the edit survives)", afterCancelled.includes("Oops renamed (edited)") && afterCancelled.includes("Added after backup"));

  result = cli("restore.mjs", [backupFile, "--cafe", String(testCafeId), "--apply", "--safety-dir", safetyDir]);
  check("restore succeeds", result.code === 0, result.out);
  check("café is exactly as backed up (ids, prices, dates, timestamps)", (await snapshot(testCafeId)) === original);
  const safetyFiles = existsSync(safetyDir) ? readdirSync(safetyDir).sort() : [];
  check("a safety backup was written before each attempt", safetyFiles.length === 2, safetyFiles.join(", "));
  if (safetyFiles.length > 0) {
    const safety = JSON.parse(readFileSync(join(safetyDir, safetyFiles.at(-1)), "utf8"));
    check("the safety backup holds the pre-restore state", safety.tables.offers.rows.some((row) => row.title === "Added after backup"));
  }

  result = cli("restore.mjs", [backupFile, "--cafe", String(testCafeId)]);
  check("restoring again finds nothing to do", result.code === 0 && result.out.includes("already matches"), result.out);

  const [{ max_id: maxItemId }] = await sql.query(`SELECT max(id) AS max_id FROM menu_items`);
  const [{ last: itemCounter }] = await sql.query(`SELECT pg_sequence_last_value(pg_get_serial_sequence('menu_items', 'id')::regclass) AS last`);
  check("the item id counter is past every restored id", Number(itemCounter) >= Number(maxItemId), `${itemCounter} vs ${maxItemId}`);
  check("café #1 is untouched", (await snapshot(1)) === realCafeBefore);

  /* ------------------------------------------------- schema changes */
  console.log("\nSchema changes since the backup");
  const drifted = structuredClone(backup);
  for (const row of drifted.tables.menu_items.rows.filter((r) => r.cafe_id === testCafeId)) {
    row.legacy_flag = true; // a column the database no longer has
    delete row.is_published; // a column the backup did not have yet
  }
  const driftedFile = join(work, "drifted.json");
  writeFileSync(driftedFile, JSON.stringify(drifted));
  await sql.query(`UPDATE cafes SET tagline = 'drift' WHERE id = $1`, [testCafeId]);
  result = cli("restore.mjs", [driftedFile, "--cafe", String(testCafeId)]);
  check("preview lists the column that can't be restored", result.out.includes("cannot be restored: legacy_flag"), result.out);
  check("preview lists the column that will be reset", result.out.includes("reset to defaults: is_published"), result.out);
  result = cli("restore.mjs", [driftedFile, "--cafe", String(testCafeId), "--apply", "--safety-dir", safetyDir]);
  check("applying needs --accept-schema-changes", result.code === 1 && result.out.includes("--accept-schema-changes"), result.out);
  check("the refused restore changed nothing", JSON.parse(await snapshot(testCafeId)).cafe?.tagline === "drift");
  result = cli("restore.mjs", [driftedFile, "--cafe", String(testCafeId), "--apply", "--accept-schema-changes", "--safety-dir", safetyDir]);
  check("with the flag, it restores", result.code === 0, result.out);
  const mocha = (await sql.query(`SELECT is_published FROM menu_items WHERE cafe_id = $1 AND name = 'Mocha'`, [testCafeId]))[0];
  check("a column missing from the backup gets its default", mocha?.is_published === true, JSON.stringify(mocha));
  result = cli("restore.mjs", [backupFile, "--cafe", String(testCafeId), "--apply", "--safety-dir", safetyDir]);
  check("the original backup still restores exactly", result.code === 0 && (await snapshot(testCafeId)) === original, result.out);

  /* ------------------------------------------------------- refusals */
  console.log("\nRefusals");
  result = cli("restore.mjs", [backupFile, "--all", "--apply"]);
  check("--all refuses a database that has data", result.code === 1 && result.out.includes("only restores into an empty database"), result.out);
  check("unknown café is refused", cli("restore.mjs", [backupFile, "--cafe", "999999"]).code === 1);
  check("missing --cafe/--all is refused", cli("restore.mjs", [backupFile]).code === 1);

  const notJson = join(work, "not.json");
  writeFileSync(notJson, "{ nope");
  check("a non-JSON file is refused", cli("restore.mjs", [notJson, "--cafe", String(testCafeId)]).code === 1);
  const wrongFormat = join(work, "wrong.json");
  writeFileSync(wrongFormat, JSON.stringify({ format: "something-else" }));
  check("a non-BrewSite file is refused", cli("restore.mjs", [wrongFormat, "--cafe", String(testCafeId)]).code === 1);

  const tampered = structuredClone(backup);
  tampered.tables.cafes.rows.find((row) => row.id === testCafeId)['name") = (SELECT 1); DROP TABLE cafes; --'] = "x";
  const tamperedFile = join(work, "tampered.json");
  writeFileSync(tamperedFile, JSON.stringify(tampered));
  result = cli("restore.mjs", [tamperedFile, "--cafe", String(testCafeId), "--apply", "--safety-dir", safetyDir]);
  check("a tampered column name is refused before any SQL runs", result.code === 1 && result.out.includes("Unsafe identifier"), result.out);

  const clash = structuredClone(backup);
  clash.tables.menu_items.rows.find((row) => row.cafe_id === testCafeId).id = otherItem.id;
  const clashFile = join(work, "clash.json");
  writeFileSync(clashFile, JSON.stringify(clash));
  await sql.query(`UPDATE cafes SET name = 'Changed again' WHERE id = $1`, [testCafeId]);
  result = cli("restore.mjs", [clashFile, "--cafe", String(testCafeId), "--apply", "--safety-dir", safetyDir]);
  check("ids now owned by another café are refused", result.code === 1 && result.out.includes("belong to another café"), result.out);
  check("the refused restore changed nothing", (await snapshot(testCafeId)).includes("Changed again"));
  check("the other café's item is untouched", (await sql.query(`SELECT name FROM menu_items WHERE id = $1`, [otherItem.id]))[0]?.name === "Other item");
  check("café #1 is still untouched", (await snapshot(1)) === realCafeBefore);

  /* ---------------------- --all into empty tables, with FKs and counters */
  console.log("\nRebuild everything into empty tables");
  await sql.query(`CREATE SCHEMA ${testSchema}`);
  for (const table of [...TABLES, "sessions"]) {
    await sql.query(`CREATE TABLE ${testSchema}.${table} (LIKE public.${table} INCLUDING ALL)`);
  }
  // LIKE copies defaults that point at public's counters; give each copy its own.
  for (const table of TABLES) {
    await sql.query(`CREATE SEQUENCE ${testSchema}.${table}_id_seq OWNED BY ${testSchema}.${table}.id`);
    await sql.query(`ALTER TABLE ${testSchema}.${table} ALTER COLUMN id SET DEFAULT nextval('${testSchema}.${table}_id_seq')`);
  }
  // Foreign keys too, so a wrong insert order or broken reference would fail.
  const foreignKeys = await sql.query(
    `SELECT c.conrelid::regclass::text AS tbl, c.conname, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace`,
  );
  for (const fk of foreignKeys) {
    const table = fk.tbl.replace(/^public\./, "").replace(/"/g, "");
    const def = fk.def.replace(/REFERENCES (public\.)?/, `REFERENCES ${testSchema}.`);
    await sql.query(`ALTER TABLE ${testSchema}.${table} ADD CONSTRAINT ${fk.conname} ${def}`);
  }
  check("(setup) foreign keys copied", foreignKeys.length >= 7, String(foreignKeys.length));

  result = cli("restore.mjs", [backupFile, "--all", "--schema", testSchema]);
  check("preview of a full rebuild succeeds", result.code === 0, result.out);
  result = cli("restore.mjs", [backupFile, "--all", "--apply", "--schema", testSchema]);
  check("full rebuild succeeds", result.code === 0, result.out);
  for (const table of TABLES) {
    const rows = (await sql.query(`SELECT to_jsonb(t) AS row FROM ${testSchema}.${table} t ORDER BY id`)).map((r) => r.row);
    check(
      `${table}: ${backup.tables[table].rows.length} row(s), every one identical`,
      backup.tables[table].rows.length > 0 && JSON.stringify(rows) === JSON.stringify(backup.tables[table].rows),
    );
    const [{ next }] = await sql.query(`SELECT nextval('${testSchema}.${table}_id_seq') AS next`);
    check(`${table}: new ids continue after the backed-up counter`, Number(next) === backup.sequences[table] + 1, `${next} vs ${backup.sequences[table]}`);
  }
  result = cli("restore.mjs", [backupFile, "--all", "--apply", "--schema", testSchema]);
  check("a second full rebuild is refused (no overwrite)", result.code === 1 && result.out.includes("only restores into an empty database"), result.out);

  // A single-café restore must move a counter that is behind its table forward.
  await sql.query(`SELECT setval('${testSchema}.menu_items_id_seq', 1)`);
  await sql.query(`DELETE FROM ${testSchema}.menu_items WHERE cafe_id = $1 AND name = 'Toast'`, [testCafeId]);
  result = cli("restore.mjs", [backupFile, "--cafe", String(testCafeId), "--apply", "--schema", testSchema, "--safety-dir", safetyDir]);
  check("single-café restore into the rebuilt copy succeeds", result.code === 0, result.out);
  const [{ max_id: copyMax }] = await sql.query(`SELECT max(id) AS max_id FROM ${testSchema}.menu_items`);
  const [{ next: copyNext }] = await sql.query(`SELECT nextval('${testSchema}.menu_items_id_seq') AS next`);
  check("a counter left behind is moved forward past the restored ids", Number(copyNext) > Number(copyMax), `${copyNext} vs ${copyMax}`);
}

try {
  await main();
} catch (error) {
  failures.push(`crashed: ${error.message}`);
  console.error("\n✗ Test run crashed:", error);
} finally {
  // Each step on its own, so one failure cannot leave the others undone.
  const steps = [
    ["test cafés", async () => { if (testCafeIds.length) await sql.query(`DELETE FROM cafes WHERE id = ANY($1::int[])`, [testCafeIds]); }],
    ["temporary schema", () => sql.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`)],
    ["temporary files", async () => rmSync(work, { recursive: true, force: true })],
  ];
  for (const [label, step] of steps) {
    try {
      await step();
    } catch (error) {
      failures.push(`cleanup: ${label}`);
      console.error(`✗ Cleanup of ${label} failed:`, error);
    }
  }
  console.log("\nCleaned up the test cafés, temporary schema and files.");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
