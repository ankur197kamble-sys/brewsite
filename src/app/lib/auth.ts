import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing and session tokens built on Node's crypto primitives, so
 * authentication adds no third-party dependencies.
 */

const scrypt = promisify<string, Buffer, number, Buffer>(scryptCallback);

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export const SESSION_COOKIE = "brewsite_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length,
  );

  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}

/**
 * Burns roughly the same time as a real verification so a missing account and
 * a wrong password are not distinguishable by response timing.
 */
export async function fakePasswordVerify(password: string): Promise<void> {
  await scrypt(password, randomBytes(SALT_LENGTH), KEY_LENGTH);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The cookie carries the raw token; only this hash is ever stored. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_DURATION_MS);
}
