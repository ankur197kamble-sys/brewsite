/**
 * Creates a dashboard account for a café.
 *
 * Usage:
 *   node --env-file=.env.local scripts/create-user.mjs <email> <password> [cafeId]
 *
 * Run through npm:
 *   npm run create-user -- <email> <password> [cafeId]
 *
 * Pass the password as an argument only on a trusted machine; it will be
 * visible in your shell history.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/app/db/index.ts";
import { cafes, users } from "../src/app/db/schema.ts";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/app/lib/auth.ts";

const [emailArg, password, cafeIdArg] = process.argv.slice(2);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!emailArg || !password) {
  fail(
    "Usage: node --env-file=.env.local scripts/create-user.mjs <email> <password> [cafeId]",
  );
}

const email = emailArg.trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("That is not a valid email address.");

if (password.length < MIN_PASSWORD_LENGTH) {
  fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
}

const cafeId = cafeIdArg ? Number(cafeIdArg) : 1;
if (!Number.isInteger(cafeId) || cafeId < 1) fail("cafeId must be a positive integer.");

const [cafe] = await db.select().from(cafes).where(eq(cafes.id, cafeId)).limit(1);
if (!cafe) fail(`No café with id ${cafeId} exists.`);

const [existing] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);

if (existing) fail(`An account already exists for ${email}.`);

const [created] = await db
  .insert(users)
  .values({ email, cafeId, passwordHash: await hashPassword(password) })
  .returning({ id: users.id, email: users.email, cafeId: users.cafeId });

console.log(
  `✓ Created user #${created.id} (${created.email}) for café #${created.cafeId} — "${cafe.name}"`,
);
process.exit(0);
