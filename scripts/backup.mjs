/**
 * Saves a complete, consistent snapshot of the site's data.
 *
 * Usage:
 *   npm run backup
 *   npm run backup -- --out <file.json>
 *
 * Writes backups/brewsite-<date>_<time>.json (git-ignored: it contains
 * dashboard password hashes). Restore with scripts/restore.mjs.
 */
import { createBackup, defaultBackupPath, getSql, summarize, writeBackup } from "./lib/backup-core.mjs";

const outIndex = process.argv.indexOf("--out");
const out = outIndex !== -1 ? process.argv[outIndex + 1] : defaultBackupPath();
if (!out) {
  console.error("✗ --out needs a file path.");
  process.exit(1);
}

try {
  const backup = await createBackup(getSql());
  const path = writeBackup(backup, out);
  console.log(`✓ Backup saved to ${path}`);
  console.log(`  ${summarize(backup)}`);
  console.log("  Keep this file private: it contains login password hashes.");
} catch (error) {
  console.error(`✗ Backup failed: ${error.message}`);
  process.exit(1);
}
