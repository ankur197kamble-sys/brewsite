/**
 * Restores data from a backup made by scripts/backup.mjs.
 *
 * Usage:
 *   npm run restore -- <backup.json> --cafe <id>          # preview
 *   npm run restore -- <backup.json> --cafe <id> --apply  # write
 *   npm run restore -- <backup.json> --all --apply        # empty database only
 *
 * --cafe <id>  Puts one café's content back exactly as it was in the backup:
 *              its details, menu, gallery and offers. Logins, sessions and
 *              upload records are left alone, as is every other café.
 * --all        Rebuilds every table into a fresh, empty database (after
 *              `npm run db:push` on a new database). Refuses to run if any
 *              table already has data, so it can never overwrite anything.
 *
 * Nothing is written without --apply. Before writing, a safety backup of the
 * current data is saved, and all changes run in a single transaction that
 * first checks nothing changed since that safety backup: either everything
 * is restored or nothing changes.
 *
 * If the database's columns differ from the backup's (a later schema
 * change), the preview lists them and --apply also needs
 * --accept-schema-changes.
 *
 * (--schema <name> and --safety-dir <dir> are used by the test suite.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CAFE_CONTENT_TABLES,
  TABLES,
  createBackup,
  defaultBackupPath,
  getColumns,
  getSql,
  ident,
  serialTableArg,
  tableRef,
  validateBackup,
  writeBackup,
} from "./lib/backup-core.mjs";

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const file = process.argv[2];
const apply = process.argv.includes("--apply");
const all = process.argv.includes("--all");
const acceptSchemaChanges = process.argv.includes("--accept-schema-changes");
const cafeArg = option("--cafe");
const schema = option("--schema") ?? "public";
const safetyDir = option("--safety-dir");

if (!file || file.startsWith("--")) fail("Usage: npm run restore -- <backup.json> (--cafe <id> | --all) [--apply]");
if (all === (cafeArg !== undefined)) fail("Choose exactly one of --cafe <id> or --all.");

let backup;
let sql;
let columns;
try {
  ident(schema);
  backup = JSON.parse(readFileSync(file, "utf8"));
  validateBackup(backup);
  sql = getSql();
  columns = await getColumns(sql, schema);
} catch (error) {
  fail(`Cannot use ${file}: ${error.message}`);
}
for (const table of TABLES) if (!columns[table]) fail(`Table "${table}" does not exist in schema "${schema}". Run npm run db:push first.`);

/* ---------------------------------------------------- column handling */

function backupKeys(rows) {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}

/** Columns a restore writes: in the backup rows and in the live table. */
function writtenColumns(table, rows) {
  const live = new Set(columns[table]);
  return backupKeys(rows).filter((name) => live.has(name));
}

/**
 * Differences between the backup and the live table:
 * - dropped: in the backup but no longer in the database (cannot be restored);
 * - reset: in the database but not in the backup; rows re-inserted by the
 *   restore get the column's default instead of their current value.
 */
function schemaDifferences(table, rows, { reinserted }) {
  if (rows.length === 0) return { dropped: [], reset: [] };
  const keys = new Set(backupKeys(rows));
  return {
    dropped: [...keys].filter((name) => !columns[table].includes(name)),
    reset: reinserted ? columns[table].filter((name) => !keys.has(name)) : [],
  };
}

function reportSchemaDifferences(differences) {
  const lines = Object.entries(differences).flatMap(([table, { dropped, reset }]) => [
    ...(dropped.length ? [`  ${table}: no longer in the database, cannot be restored: ${dropped.join(", ")}`] : []),
    ...(reset.length ? [`  ${table}: not in the backup, will be reset to defaults: ${reset.join(", ")}`] : []),
  ]);
  if (lines.length === 0) return false;
  console.log("\nThe database's columns differ from the backup's:");
  for (const line of lines) console.log(line);
  return true;
}

function insertQuery(txn, table, rows) {
  const cols = writtenColumns(table, rows).map(ident).join(", ");
  return txn.query(
    `INSERT INTO ${tableRef(schema, table)} (${cols})
     SELECT ${cols} FROM jsonb_populate_recordset(NULL::${tableRef(schema, table)}, $1::jsonb)`,
    [JSON.stringify(rows)],
  );
}

async function saveSafetyBackup() {
  const current = await createBackup(sql, { schema });
  const path = safetyDir ? join(safetyDir, `safety-${Date.now()}.json`) : defaultBackupPath("before-restore");
  writeBackup(current, path);
  console.log(`  Safety backup of the current data saved to ${path}`);
  return current;
}

/** Turns the guard's and Postgres's concurrency errors into a clear message. */
async function runRestoreTransaction(build, options) {
  try {
    await sql.transaction(build, options);
  } catch (error) {
    // 22012: the guard below found a change; 40001: a concurrent update.
    if (error?.code === "22012" || error?.code === "40001") {
      fail("The data changed while restoring (someone edited the dashboard). Nothing was changed. Run the restore again.");
    }
    fail(`Restore failed and was rolled back, so nothing was changed: ${error.message}`);
  }
}

const describe = (row) => row.name ?? row.title ?? row.alt ?? row.url ?? `#${row.id}`;

/* ------------------------------------------------------------- --all mode */

if (all) {
  const counts = await sql.transaction((txn) =>
    [...TABLES, "sessions"].map((table) => txn.query(`SELECT count(*)::int AS n FROM ${tableRef(schema, table)}`)),
  );
  const nonEmpty = [...TABLES, "sessions"].filter((_, index) => counts[index][0].n > 0);
  if (nonEmpty.length > 0) {
    fail(`--all only restores into an empty database, but these tables have data: ${nonEmpty.join(", ")}. Nothing was changed.`);
  }

  console.log(`Restoring the whole backup from ${backup.createdAt} into empty schema "${schema}":`);
  for (const table of TABLES) console.log(`  ${table}: ${backup.tables[table].rows.length} row(s)`);

  const differences = Object.fromEntries(
    TABLES.map((table) => [table, schemaDifferences(table, backup.tables[table].rows, { reinserted: true })]),
  );
  const differs = reportSchemaDifferences(differences);

  if (!apply) {
    console.log("\nPreview only. Re-run with --apply to write.");
    process.exit(0);
  }
  if (differs && !acceptSchemaChanges) fail("Re-run with --accept-schema-changes to restore anyway. Nothing was changed.");

  await runRestoreTransaction((txn) => [
    ...TABLES.filter((table) => backup.tables[table].rows.length > 0).map((table) =>
      insertQuery(txn, table, backup.tables[table].rows),
    ),
    // Continue each id counter where the backed-up database left off, so ids
    // that were handed out and deleted are never reused.
    ...TABLES.map((table) =>
      txn.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST(COALESCE(max(id), 0), $2::bigint))
         FROM ${tableRef(schema, table)}
         HAVING pg_get_serial_sequence($1, 'id') IS NOT NULL AND GREATEST(COALESCE(max(id), 0), $2::bigint) > 0`,
        [serialTableArg(schema, table), backup.sequences?.[table] ?? 0],
      ),
    ),
  ]);
  console.log("\n✓ Restore complete.");
  process.exit(0);
}

/* ------------------------------------------------------------ --cafe mode */

const cafeId = Number(cafeArg);
if (!Number.isInteger(cafeId) || cafeId < 1) fail("--cafe needs a café id, e.g. --cafe 1");

const backupCafe = backup.tables.cafes.rows.find((row) => row.id === cafeId);
if (!backupCafe) fail(`Café #${cafeId} is not in this backup.`);

const [current] = await sql.query(
  `SELECT to_jsonb(c) AS row FROM ${tableRef(schema, "cafes")} c WHERE c.id = $1`,
  [cafeId],
);
if (!current) fail(`Café #${cafeId} does not exist in the database. Use --all to rebuild an empty database instead.`);

const backupContent = Object.fromEntries(
  CAFE_CONTENT_TABLES.map((table) => [table, backup.tables[table].rows.filter((row) => row.cafe_id === cafeId)]),
);

const currentContent = {};
for (const table of CAFE_CONTENT_TABLES) {
  const rows = await sql.query(
    `SELECT to_jsonb(t) AS row FROM ${tableRef(schema, table)} t WHERE t.cafe_id = $1 ORDER BY t.id`,
    [cafeId],
  );
  currentContent[table] = rows.map((result) => result.row);

  // Restored rows keep their original ids. Those ids were only ever this
  // café's, but refuse rather than guess if one now belongs to another café.
  const ids = backupContent[table].map((row) => row.id);
  if (ids.length > 0) {
    const clashes = await sql.query(
      `SELECT id FROM ${tableRef(schema, table)} WHERE id = ANY($1::int[]) AND cafe_id <> $2`,
      [ids, cafeId],
    );
    if (clashes.length > 0) {
      fail(`${table} id(s) ${clashes.map((row) => row.id).join(", ")} now belong to another café. Nothing was changed.`);
    }
  }
}

console.log(`Restoring café #${cafeId} "${backupCafe.name}" to how it was at ${backup.createdAt}\n`);

// Compare exactly what the restore will write, nothing more.
const pick = (row, cols) => JSON.stringify(cols.map((name) => row[name] ?? null));

const cafeColumns = writtenColumns("cafes", [backupCafe]).filter((name) => name !== "id");
const changedFields = cafeColumns.filter(
  (name) => JSON.stringify(current.row[name] ?? null) !== JSON.stringify(backupCafe[name] ?? null),
);
console.log(`Café details: ${changedFields.length === 0 ? "no changes" : changedFields.join(", ")}`);

let anyChange = changedFields.length > 0;
for (const table of CAFE_CONTENT_TABLES) {
  const cols = writtenColumns(table, backupContent[table]);
  const before = new Map(currentContent[table].map((row) => [row.id, row]));
  const after = new Map(backupContent[table].map((row) => [row.id, row]));
  const removed = [...before.values()].filter((row) => !after.has(row.id));
  const added = [...after.values()].filter((row) => !before.has(row.id));
  const changed = [...after.values()].filter(
    (row) => before.has(row.id) && pick(before.get(row.id), cols) !== pick(row, cols),
  );
  anyChange ||= removed.length + added.length + changed.length > 0;
  console.log(`${table}: ${after.size} in backup, ${before.size} now`);
  if (added.length) console.log(`  brought back: ${added.map(describe).join(", ")}`);
  if (removed.length) console.log(`  removed (not in backup): ${removed.map(describe).join(", ")}`);
  if (changed.length) console.log(`  reverted: ${changed.map(describe).join(", ")}`);
}

const differences = {
  cafes: schemaDifferences("cafes", [backupCafe], { reinserted: false }),
  ...Object.fromEntries(
    CAFE_CONTENT_TABLES.map((table) => [table, schemaDifferences(table, backupContent[table], { reinserted: true })]),
  ),
};
const differs = reportSchemaDifferences(differences);

if (!anyChange && !differs) {
  console.log("\nCafé already matches the backup. Nothing to do.");
  process.exit(0);
}
if (!apply) {
  console.log("\nPreview only. Re-run with --apply to write.");
  process.exit(0);
}
if (differs && !acceptSchemaChanges) fail("Re-run with --accept-schema-changes to restore anyway. Nothing was changed.");

const safety = await saveSafetyBackup();

// Test-only: simulates someone editing the dashboard between the safety
// backup and the restore, to prove the guard below catches it.
if (process.env.BREWSITE_TEST_EDIT_DURING_RESTORE === "1") {
  await sql.query(`UPDATE ${tableRef(schema, "cafes")} SET name = name || ' (edited)' WHERE id = $1`, [cafeId]);
}

/**
 * First statements of the transaction: fail (division by zero, caught above)
 * unless the café is exactly as the safety backup recorded it. The batch runs
 * at REPEATABLE READ, so the checks and the writes see the same snapshot and
 * a change committed in between can neither be overwritten nor lost.
 */
const guard = (txn, table, condition, rows) =>
  txn.query(
    `SELECT 1 / (CASE WHEN (
       SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb)
       FROM ${tableRef(schema, table)} t WHERE ${condition}
     ) = $2::jsonb THEN 1 ELSE 0 END)`,
    [cafeId, JSON.stringify(rows)],
  );

await runRestoreTransaction(
  (txn) => [
    guard(txn, "cafes", "t.id = $1", safety.tables.cafes.rows.filter((row) => row.id === cafeId)),
    ...CAFE_CONTENT_TABLES.map((table) =>
      guard(txn, table, "t.cafe_id = $1", safety.tables[table].rows.filter((row) => row.cafe_id === cafeId)),
    ),
    txn.query(
      `UPDATE ${tableRef(schema, "cafes")}
       SET (${cafeColumns.map(ident).join(", ")}) =
           (SELECT ${cafeColumns.map(ident).join(", ")} FROM jsonb_populate_record(NULL::${tableRef(schema, "cafes")}, $1::jsonb))
       WHERE id = $2`,
      [JSON.stringify(backupCafe), cafeId],
    ),
    // Children before parents: menu items reference their categories.
    ...["menu_items", "gallery_images", "offers", "menu_categories"].map((table) =>
      txn.query(`DELETE FROM ${tableRef(schema, table)} WHERE cafe_id = $1`, [cafeId]),
    ),
    ...CAFE_CONTENT_TABLES.filter((table) => backupContent[table].length > 0).map((table) =>
      insertQuery(txn, table, backupContent[table]),
    ),
    // Restored rows keep their old ids. Move each shared id counter forward
    // past them if needed (never backward), so the next dashboard insert
    // cannot collide with a restored row.
    ...CAFE_CONTENT_TABLES.map((table) =>
      txn.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), max(id)) FROM ${tableRef(schema, table)}
         HAVING pg_get_serial_sequence($1, 'id') IS NOT NULL
            AND max(id) > COALESCE(pg_sequence_last_value(pg_get_serial_sequence($1, 'id')::regclass), 0)`,
        [serialTableArg(schema, table)],
      ),
    ),
  ],
  { isolationLevel: "RepeatableRead" },
);

console.log("\n✓ Restore complete.");
process.exit(0);
