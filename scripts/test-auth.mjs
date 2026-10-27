/**
 * Sign-in and request-origin protections, against a running dev server.
 *
 * Usage (with `npm run dev` already running):
 *   npm run test:auth
 *
 * Works only on a throwaway "[test] …" café, deleted afterwards, plus the
 * sign-in attempt records this run creates. Uses addresses from the
 * 198.18.0.0/15 benchmarking range, which no real visitor has.
 */
import { randomBytes } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/app/db/index.ts";
import { loginAttempts, users } from "../src/app/db/schema.ts";
import { hashPassword } from "../src/app/lib/auth.ts";
import { secretHash } from "../src/app/lib/secret-hash.ts";
import {
  BASE_URL,
  call,
  check,
  createTenant,
  finish,
  onCleanup,
  run,
  section,
  stopIfInterrupted,
} from "./lib/harness.mjs";

const usedKeys = new Set();
let ipCounter = 0;

/** A fresh benchmarking-range address per scenario, so limits do not mix. */
function freshIp() {
  ipCounter += 1;
  const ip = `198.18.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
  usedKeys.add(secretHash(`login-ip:${ip}`));
  return ip;
}

const pairKey = (email, ip) => secretHash(`login-pair:${email}|${ip}`);

async function signIn(email, password, { ip = freshIp(), headers = {}, raw } = {}) {
  stopIfInterrupted();
  usedKeys.add(secretHash(`login-email:${email}`));
  usedKeys.add(pairKey(email, ip));
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, ...headers },
    body: raw ?? JSON.stringify({ email, password }),
  });
  const cookie = response.headers.getSetCookie().some((header) => header.startsWith("brewsite_session="));
  return { status: response.status, json: await response.json().catch(() => null), cookie };
}

async function addUser(cafeId, label) {
  const email = `${label}-${run}@brewsite.test`;
  const password = randomBytes(18).toString("base64url");
  await db.insert(users).values({ cafeId, email, passwordHash: await hashPassword(password) });
  return { email, password };
}

const statuses = (results) => results.map((r) => r.status);
const tally = (results, status) => results.filter((r) => r.status === status).length;

async function main() {
  onCleanup(async () => {
    if (usedKeys.size > 0) await db.delete(loginAttempts).where(inArray(loginAttempts.key, [...usedKeys]));
  });

  const tenant = await createTenant("Auth");
  const owner = await addUser(tenant.cafeId, "auth-owner");
  const second = await addUser(tenant.cafeId, "auth-second");
  const third = await addUser(tenant.cafeId, "auth-third");
  const burst = await addUser(tenant.cafeId, "auth-burst");
  const target = await addUser(tenant.cafeId, "auth-target");

  section("Signing in");
  let result = await signIn(owner.email, owner.password);
  check("correct password → 200 with a session cookie", result.status === 200 && result.cookie, `${result.status}`);
  result = await signIn(owner.email, "wrong-password-123");
  check("wrong password → 401, no cookie", result.status === 401 && !result.cookie);
  result = await signIn("nobody-" + run + "@brewsite.test", "whatever-password");
  check("unknown email → the same 401", result.status === 401 && result.json?.message === "Invalid email or password");
  result = await signIn(owner.email, "x".repeat(300));
  check("an absurdly long password is refused without hashing (401)", result.status === 401);

  section("Password guessing is slowed down");
  const guesser = freshIp();
  const guesses = [];
  for (let i = 0; i < 5; i += 1) guesses.push(await signIn(second.email, `guess-${i}-password`, { ip: guesser }));
  check("five wrong passwords → 401 each", tally(guesses, 401) === 5, statuses(guesses).join(","));
  result = await signIn(second.email, second.password, { ip: guesser });
  check(
    "then even the right password from that network waits: 429",
    result.status === 429 && !result.cookie && /Too many sign-in attempts/.test(result.json?.message ?? ""),
    `${result.status} ${result.json?.message}`,
  );
  for (let i = 0; i < 3; i += 1) await signIn(second.email, `more-${i}-password`, { ip: guesser });
  const [{ count: pairRows }] = await db
    .select({ count: sql`count(*)::int` })
    .from(loginAttempts)
    .where(eq(loginAttempts.key, pairKey(second.email, guesser)));
  check("refused attempts are not counted, so the pause is never extended", pairRows === 5, `${pairRows} rows`);
  result = await signIn(owner.email, owner.password, { ip: guesser });
  check("other accounts on that network still sign in", result.status === 200 && result.cookie, `${result.status}`);
  result = await signIn(second.email, second.password);
  check("the owner can still sign in from their own network: 200", result.status === 200 && result.cookie, `${result.status}`);

  const burstIp = freshIp();
  const burstRuns = await Promise.all(
    Array.from({ length: 12 }, (_, i) => signIn(burst.email, `burst-${i}-password`, { ip: burstIp })),
  );
  check(
    "12 guesses fired at the same moment: at most 5 are checked, the rest wait",
    tally(burstRuns, 401) >= 1 && tally(burstRuns, 401) <= 5 && tally(burstRuns, 401) + tally(burstRuns, 429) === 12,
    statuses(burstRuns).join(","),
  );

  const spread = [];
  for (let start = 0; start < 50; start += 10) {
    spread.push(
      ...(await Promise.all(
        Array.from({ length: 10 }, (_, j) => signIn(target.email, `spread-${start + j}-password`)),
      )),
    );
  }
  check("50 guesses at one account from 50 networks → 401 each", tally(spread, 401) === 50, statuses(spread).join(","));
  result = await signIn(target.email, target.password);
  check("then that account waits everywhere, even with the right password: 429", result.status === 429 && !result.cookie, `${result.status}`);

  const sprayer = freshIp();
  const sprays = [];
  for (let i = 0; i < 20; i += 1) {
    sprays.push(await signIn(`spray-${i}-${run}@brewsite.test`, "password-guess-1", { ip: sprayer }));
  }
  check("twenty failed sign-ins from one network → 401 each", tally(sprays, 401) === 20, statuses(sprays).join(","));
  result = await signIn(owner.email, owner.password, { ip: sprayer });
  check("then that network waits, even with a right password: 429", result.status === 429 && !result.cookie, `${result.status}`);

  const home = freshIp();
  const forgiven = [];
  for (let i = 0; i < 4; i += 1) forgiven.push(await signIn(third.email, `typo-${i}-password`, { ip: home }));
  const recovered = await signIn(third.email, third.password, { ip: home });
  const againWrong = [];
  for (let i = 0; i < 4; i += 1) againWrong.push(await signIn(third.email, `typo2-${i}-password`, { ip: home }));
  const stillFine = await signIn(third.email, third.password, { ip: home });
  check(
    "a successful sign-in forgives earlier typos",
    tally(forgiven, 401) === 4 && recovered.status === 200 && tally(againWrong, 401) === 4 && stillFine.status === 200,
    `${statuses(forgiven)} ${recovered.status} ${statuses(againWrong)} ${stillFine.status}`,
  );

  const wifi = freshIp();
  const staff = [];
  for (let i = 0; i < 22; i += 1) staff.push(await signIn(owner.email, owner.password, { ip: wifi }));
  check(
    "successful sign-ins do not use up a shared network's allowance (22 in a row → 200)",
    tally(staff, 200) === 22,
    statuses(staff).join(","),
  );

  section("Requests from other websites");
  result = await signIn(owner.email, owner.password, {
    headers: { "Content-Type": "text/plain" },
    raw: JSON.stringify({ email: owner.email, password: owner.password }),
  });
  check("a plain-text form post (as another site's form would send) does not sign in", result.status === 400 && !result.cookie, `${result.status}`);
  result = await signIn(owner.email, owner.password, { headers: { Origin: "https://evil.example" } });
  check("a sign-in sent from another website's page → 403", result.status === 403 && !result.cookie, `${result.status}`);
  result = await signIn(owner.email, owner.password, { headers: { Origin: BASE_URL } });
  check("a sign-in from this site's own page works", result.status === 200 && result.cookie, `${result.status}`);

  const crossSiteEdit = await fetch(`${BASE_URL}/api/tables`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example", Cookie: tenant.cookie },
    body: JSON.stringify({ label: "Planted by another site" }),
  });
  check("a dashboard change sent from another website, even with the owner's cookie → 403", crossSiteEdit.status === 403, `${crossSiteEdit.status}`);
  const tables = (await call("GET", "/api/tables", { cookie: tenant.cookie })).json?.data?.tables ?? [];
  check("…and nothing was created", !tables.some((table) => table.label === "Planted by another site"));
  const crossSiteRead = await fetch(`${BASE_URL}/api/tables`, { headers: { Origin: "https://evil.example", Cookie: tenant.cookie } });
  check("reading is unaffected (a GET with another site's Origin is answered as usual)", crossSiteRead.status === 200, `${crossSiteRead.status}`);
}

await finish(main);
