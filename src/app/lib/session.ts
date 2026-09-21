import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionRow,
  deleteExpiredSessions,
  deleteSessionRow,
  findSessionUser,
} from "@/app/db/auth";
import {
  SESSION_COOKIE,
  generateSessionToken,
  hashSessionToken,
  sessionExpiry,
} from "@/app/lib/auth";

export type CafeSession = {
  userId: number;
  email: string;
  cafeId: number;
};

/**
 * The authenticated café context for the current request.
 *
 * Memoized per render pass so a page and its data loaders share one lookup.
 * Returns null rather than redirecting, so API routes can answer 401.
 */
export const getCafeSession = cache(async (): Promise<CafeSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const row = await findSessionUser(tokenHash);
  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await deleteSessionRow(tokenHash);
    return null;
  }

  return { userId: row.userId, email: row.email, cafeId: row.cafeId };
});

/** For dashboard pages and layouts: no valid session means no page. */
export async function requireCafeSession(): Promise<CafeSession> {
  const session = await getCafeSession();
  if (!session) redirect("/login");
  return session;
}

export async function startSession(userId: number): Promise<void> {
  await deleteExpiredSessions(userId);

  const token = generateSessionToken();
  const expiresAt = sessionExpiry();
  await createSessionRow(hashSessionToken(token), userId, expiresAt);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) await deleteSessionRow(hashSessionToken(token));

  cookieStore.delete(SESSION_COOKIE);
}
