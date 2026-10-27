import { createHash } from "node:crypto";

/**
 * SHA-256 of a value with a server-only secret mixed in, for things the
 * server only ever compares (a network address, a phone's app id, an email
 * being rate-limited). The database never holds the value itself, and the
 * hash cannot be reversed or recomputed without the secret.
 */
export function secretHash(value: string): string {
  return createHash("sha256").update(`${value}|${process.env.DATABASE_URL ?? ""}`).digest("hex");
}

/** The client's address as Vercel reports it (first entry of x-forwarded-for). */
export function clientAddress(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}
