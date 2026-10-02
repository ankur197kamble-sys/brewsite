/**
 * Sets a new password for an existing dashboard account.
 *
 * Usage:
 *   npm run set-password -- <email>
 *   node --env-file=.env.local scripts/set-password.mjs <email>
 *
 * The password is typed at a hidden prompt, twice, so it never appears on
 * screen or in shell history. Every existing session for the account is
 * signed out, so anyone holding an old login is logged out everywhere.
 */
import readline from "node:readline";
import { eq } from "drizzle-orm";
import { db } from "../src/app/db/index.ts";
import { sessions, users } from "../src/app/db/schema.ts";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/app/lib/auth.ts";

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const emailArg = process.argv[2];
if (!emailArg) fail("Usage: npm run set-password -- <email>");
const email = emailArg.trim().toLowerCase();

const [user] = await db
  .select({ id: users.id, cafeId: users.cafeId })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);
if (!user) fail(`No account exists for ${email}.`);

// One reader for the whole run. Typed characters are not echoed while a
// hidden prompt is active; piped input (e.g. from a test) also works.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY),
});
let muted = false;
rl._writeToOutput = (text) => {
  if (!muted) rl.output.write(text);
};
const pending = [];
const waiting = [];
rl.on("line", (line) => (waiting.length ? waiting.shift()(line) : pending.push(line)));

function askHidden(prompt) {
  process.stdout.write(prompt);
  muted = true;
  return new Promise((resolve) => {
    const done = (answer) => {
      muted = false;
      process.stdout.write("\n");
      resolve(answer);
    };
    if (pending.length) done(pending.shift());
    else waiting.push(done);
  });
}

console.log(`Setting a new password for ${email} (café #${user.cafeId}).`);
const password = await askHidden(`New password (at least ${MIN_PASSWORD_LENGTH} characters): `);
const confirmation = await askHidden("Type it again: ");
rl.close();

if (password.length < MIN_PASSWORD_LENGTH) {
  fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters. Nothing was changed.`);
}
if (password !== confirmation) fail("The two passwords did not match. Nothing was changed.");

await db
  .update(users)
  .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
  .where(eq(users.id, user.id));

const signedOut = await db
  .delete(sessions)
  .where(eq(sessions.userId, user.id))
  .returning({ tokenHash: sessions.tokenHash });

console.log(`✓ Password updated for ${email}. Signed out ${signedOut.length} existing session(s).`);
process.exit(0);
