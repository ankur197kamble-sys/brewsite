import { and, eq, lt } from "drizzle-orm";
import { db } from "@/app/db";
import { sessions, users, type UserRow } from "@/app/db/schema";

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
