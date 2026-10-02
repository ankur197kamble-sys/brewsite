/**
 * Shared logic for scripts/backup.mjs and scripts/restore.mjs.
 *
 * Rows are converted to and from JSON by Postgres itself (`to_jsonb` and
 * `jsonb_populate_recordset`), not by JavaScript, so every value round-trips
 * exactly: timestamps keep their time zone, `date` columns stay plain
 * calendar dates, and numeric prices keep their precision.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

/** Always the repository's git-ignored backups/ folder, wherever the script runs from. */
export const BACKUP_DIR = fileURLToPath(new URL("../../backups/", import.meta.url));

export const BACKUP_FORMAT = "brewsite-backup";
export const BACKUP_VERSION = 1;

/**
 * Every table worth keeping, parents before children (the order rows must be
 * inserted in). `sessions` is deliberately excluded: login tokens are
 * short-lived, and restoring them would revive signed-out logins.
 */
export const TABLES = [
  "cafes",
  "users",
  "menu_categories",
  "menu_items",
  "gallery_images",
  "offers",
  "uploads",
];

/** Tables holding one café's content, replaced by `restore --cafe`. */
export const CAFE_CONTENT_TABLES = ["menu_categories", "menu_items", "gallery_images", "offers"];

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Run through npm, which loads .env.local.");
  }
  try {
    return neon(process.env.DATABASE_URL);
  } catch {
    // The driver's own error repeats the whole URL, password included.
    throw new Error("DATABASE_URL is not a valid Postgres URL (check that special characters in the password are percent-encoded).");
  }
}

/** `"schema"."table"` as text, for pg_get_serial_sequence(). */
export function serialTableArg(schema, table) {
  return `${ident(schema)}.${ident(table)}`;
}

/** Double-quotes an identifier, rejecting anything but plain names. */
export function ident(name) {
  if (typeof name !== "string" || !/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

export function tableRef(schema, table) {
  return `${ident(schema)}.${ident(table)}`;
}

/** Current column names per table, straight from the database. */
export async function getColumns(sql, schema) {
  const rows = await sql.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = $1 ORDER BY table_name, ordinal_position`,
    [schema],
  );
  const columns = {};
  for (const row of rows) (columns[row.table_name] ??= []).push(row.column_name);
  return columns;
}

/**
 * Reads every table in one read-only REPEATABLE READ transaction, so the
 * snapshot is consistent even if someone edits the site mid-backup.
 */
export async function createBackup(sql, { schema = "public" } = {}) {
  const columns = await getColumns(sql, schema);
  const missing = TABLES.filter((table) => !columns[table]);
  if (missing.length > 0) throw new Error(`Tables missing from the database: ${missing.join(", ")}`);

  const results = await sql.transaction(
    (txn) => [
      ...TABLES.map((table) =>
        txn.query(`SELECT to_jsonb(t) AS row FROM ${tableRef(schema, table)} t ORDER BY t.id`),
      ),
      // Where each id counter stands. Ids handed out and later deleted are
      // above max(id); a rebuild must not hand them out again.
      ...TABLES.map((table) =>
        txn.query(
          `SELECT pg_sequence_last_value(pg_get_serial_sequence($1, 'id')::regclass) AS last_value`,
          [serialTableArg(schema, table)],
        ),
      ),
    ],
    { isolationLevel: "RepeatableRead", readOnly: true },
  );

  const tables = {};
  const sequences = {};
  TABLES.forEach((table, index) => {
    tables[table] = {
      columns: columns[table],
      rows: results[index].map((result) => result.row),
    };
    const lastValue = results[TABLES.length + index][0]?.last_value;
    sequences[table] = lastValue === null || lastValue === undefined ? null : Number(lastValue);
  });

  let gitCommit = null;
  try {
    gitCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    // Not a git checkout; the commit is informational only.
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    gitCommit,
    note: "Contains password hashes for dashboard logins. Keep private; never commit.",
    tables,
    sequences,
  };
}

export function defaultBackupPath(label = "") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  return join(BACKUP_DIR, `brewsite-${stamp}${label ? `-${label}` : ""}.json`);
}

export function writeBackup(backup, path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(backup, null, 2));
  return path;
}

export function summarize(backup) {
  return TABLES.map((table) => `${table}: ${backup.tables[table].rows.length}`).join(", ");
}

/** Structural checks on a backup file before anything is restored from it. */
export function validateBackup(backup) {
  if (backup?.format !== BACKUP_FORMAT) throw new Error("This is not a BrewSite backup file.");
  if (backup.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version ${backup.version}.`);
  for (const table of TABLES) {
    const entry = backup.tables?.[table];
    if (!entry || !Array.isArray(entry.rows)) throw new Error(`Backup is missing table "${table}".`);
    for (const row of entry.rows) {
      if (typeof row !== "object" || row === null || Array.isArray(row)) {
        throw new Error(`Backup table "${table}" contains a malformed row.`);
      }
      if (!Number.isInteger(row.id) || row.id < 1) throw new Error(`Backup table "${table}" has a row without a valid id.`);
      for (const key of Object.keys(row)) ident(key);
    }
  }
  // Optional: the first backups made did not record id counters.
  if (backup.sequences !== undefined) {
    for (const [table, value] of Object.entries(backup.sequences ?? {})) {
      if (!TABLES.includes(table)) throw new Error(`Backup records a counter for unknown table "${table}".`);
      if (value !== null && (!Number.isInteger(value) || value < 0)) {
        throw new Error(`Backup has an invalid id counter for "${table}".`);
      }
    }
  }
}
