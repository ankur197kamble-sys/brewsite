/**
 * Shared helpers for the HTTP-level test scripts in scripts/test-*.mjs.
 *
 * Each script drives a running dev server as real users would, using
 * throwaway "[test] …" cafés created here. `finish()` deletes every café it
 * created (cascading to users, sessions, menu, gallery and offers) plus any
 * extra rows registered with `onCleanup`, whether the run passed or not.
 */
import { randomBytes } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "../../src/app/db/index.ts";
import { cafes, users } from "../../src/app/db/schema.ts";
import { hashPassword } from "../../src/app/lib/auth.ts";

export const BASE_URL = process.argv[2] ?? "http://localhost:3000";

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL)) {
  console.error(`✗ Refusing to run against ${BASE_URL}: local dev servers only.`);
  process.exit(1);
}

export const run = randomBytes(4).toString("hex");
export const tag = (label) => `Test ${run} ${label}`;

let passed = 0;
let interrupted = false;
const failures = [];

/**
 * Ctrl+C only raises a flag. A request already in flight finishes and
 * registers what it created, the next request stops the run, and cleanup then
 * runs exactly once from finish() with complete lists. Suites that insert
 * rows for the real public café rely on this. A second Ctrl+C falls back to
 * Node's default immediate exit.
 */
process.once("SIGINT", () => {
  interrupted = true;
  console.error("\nInterrupted — stopping after the current step, then cleaning up (Ctrl+C again to force quit)...");
});

/** Call before any request a suite makes outside call()/createTenant(). */
export function stopIfInterrupted() {
  if (interrupted) throw new Error("Interrupted");
}
const createdCafeIds = [];
const cleanupSteps = [];

export function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

export function section(title) {
  console.log(`\n${title}`);
}

export async function call(method, path, { cookie, body, raw } = {}) {
  stopIfInterrupted();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML pages and redirects are not JSON.
  }

  return { status: response.status, json, text, headers: response.headers };
}

export const expectStatus = (name, result, status) =>
  check(name, result.status === status, `expected ${status}, got ${result.status} ${result.json?.message ?? ""}`);

async function login(email, password) {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .find((pair) => pair.startsWith("brewsite_session="));

  if (!response.ok || !cookie) throw new Error(`Login failed for test user (${response.status})`);
  return cookie;
}

/** A throwaway café with one signed-in user. */
export async function createTenant(label) {
  stopIfInterrupted();
  const [cafe] = await db
    .insert(cafes)
    .values({ name: `[test] ${label} ${run}` })
    .returning({ id: cafes.id });
  createdCafeIds.push(cafe.id);

  const email = `${label.toLowerCase().replace(/\W+/g, "-")}-${run}@brewsite.test`;
  const password = randomBytes(18).toString("base64url");
  await db.insert(users).values({
    cafeId: cafe.id,
    email,
    passwordHash: await hashPassword(password),
  });

  return { cafeId: cafe.id, cookie: await login(email, password) };
}

/** Ids of the throwaway cafés created so far in this run. */
export function testCafeIds() {
  return [...createdCafeIds];
}

/** Registers extra cleanup, e.g. rows inserted for the public café. */
export function onCleanup(step) {
  cleanupSteps.push(step);
}

/**
 * Runs every registered cleanup step, each isolated so one failure cannot
 * skip the rest, and always deletes the test cafés last (which cascades to
 * their users, sessions, menu, gallery, offers and upload rows).
 */
async function cleanup() {
  let ok = true;
  for (const step of cleanupSteps) {
    try {
      await step();
    } catch (error) {
      ok = false;
      console.error("\n✗ A cleanup step failed:", error);
    }
  }

  try {
    if (createdCafeIds.length > 0) {
      await db.delete(cafes).where(inArray(cafes.id, createdCafeIds));
    }
  } catch (error) {
    ok = false;
    console.error("\n✗ Could not delete test cafés — remove '[test] …' cafés manually:", error);
  }

  if (ok) console.log("\nCleaned up everything this run created.");
  return ok;
}

/** Runs the tests, always cleans up, prints the summary and exits. */
export async function finish(main) {
  try {
    await main();
  } catch (error) {
    failures.push(`crashed: ${error instanceof Error ? error.message : String(error)}`);
    console.error("\n✗ Test run crashed:", error);
  } finally {
    if (!(await cleanup())) failures.push("cleanup");
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(interrupted ? 130 : failures.length === 0 ? 0 : 1);
}
