import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/app/db";
import { loginAttempts, sessions, users, type UserRow } from "@/app/db/schema";

/** Sign-in attempts are counted over this window. */
export const LOGIN_WINDOW_MINUTES = 15;

/**
 * What one sign-in attempt is counted against, each as a secret hash:
 * the email from this network, the email from anywhere, and the network.
 */
export type LoginKeys = { pair: string; email: string; ip: string };

export type LoginAttempt = {
  /** Row ids of this attempt, one per key. */
  ids: { pair: number; email: number; ip: number };
  /** Attempts in the window per key, this one included. */
  counts: { pair: number; email: number; ip: number };
};

/**
 * Records a sign-in attempt BEFORE it is checked, then counts.
 *
 * The insert and the count are separate statements on purpose: the insert is
 * committed before the count runs, so of any number of simultaneous attempts
 * the n-th to be counted always sees at least n rows. A burst of parallel
 * guesses therefore can never all slip under the limit together. Rows older
 * than a day are cleared out on the way.
 */
export async function claimLoginAttempt(keys: LoginKeys): Promise<LoginAttempt> {
  const inserted = await db.execute<{ id: number; key: string }>(sql`
    WITH added AS (
      INSERT INTO ${loginAttempts} (key)
      VALUES (${keys.pair}), (${keys.email}), (${keys.ip})
      RETURNING id, key
    ), pruned AS (
      DELETE FROM ${loginAttempts} WHERE created_at < now() - interval '1 day'
    )
    SELECT id, key FROM added
  `);
  const idFor = (key: string) => Number(inserted.rows.find((row) => row.key === key)?.id);

  const [row] = await db
    .select({
      pair: sql<number>`count(*) filter (where ${loginAttempts.key} = ${keys.pair})::int`,
      email: sql<number>`count(*) filter (where ${loginAttempts.key} = ${keys.email})::int`,
      ip: sql<number>`count(*) filter (where ${loginAttempts.key} = ${keys.ip})::int`,
    })
    .from(loginAttempts)
    .where(
      sql`${loginAttempts.key} in (${keys.pair}, ${keys.email}, ${keys.ip}) and ${loginAttempts.createdAt} > now() - make_interval(mins => ${LOGIN_WINDOW_MINUTES}::int)`,
    );

  return {
    ids: { pair: idFor(keys.pair), email: idFor(keys.email), ip: idFor(keys.ip) },
    counts: { pair: row?.pair ?? 0, email: row?.email ?? 0, ip: row?.ip ?? 0 },
  };
}

/** A refused attempt is not counted, so waiting out the pause always works. */
export async function forgetLoginAttempt(attempt: LoginAttempt): Promise<void> {
  const { pair, email, ip } = attempt.ids;
  await db.delete(loginAttempts).where(inArray(loginAttempts.id, [pair, email, ip]));
}

/**
 * A successful sign-in forgives earlier mistakes for that email, and does
 * not use up the network's allowance (staff often share the café's Wi-Fi).
 */
export async function clearLoginAttempts(keys: LoginKeys, attempt: LoginAttempt): Promise<void> {
  await db
    .delete(loginAttempts)
    .where(
      sql`${loginAttempts.key} in (${keys.pair}, ${keys.email}) or ${loginAttempts.id} = ${attempt.ids.ip}`,
    );
}

export type SessionUser = {
  userId: number;
  email: string;
  cafeId: number;
  expiresAt: Date;
};

export async function findUserByEmail(
  email: string,
): Promise<UserRow | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user;
}

/** Resolves a session token hash to its user, joined in a single query. */
export async function findSessionUser(
  tokenHash: string,
): Promise<SessionUser | undefined> {
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      cafeId: users.cafeId,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  return row;
}

export async function createSessionRow(
  tokenHash: string,
  userId: number,
  expiresAt: Date,
): Promise<void> {
  await db.insert(sessions).values({ tokenHash, userId, expiresAt });
}

export async function deleteSessionRow(tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

/** Housekeeping: drop this user's expired sessions when they sign in. */
export async function deleteExpiredSessions(userId: number): Promise<void> {
  await db
    .delete(sessions)
    .where(
      and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())),
    );
}
