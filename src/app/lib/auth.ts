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
const SALT_PATTERN = new RegExp(`^[0-9a-f]{${SALT_LENGTH * 2}}$`);
const HASH_PATTERN = new RegExp(`^[0-9a-f]{${KEY_LENGTH * 2}}$`);

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
  // Only the exact shape hashPassword writes is accepted. A malformed value
  // would otherwise decode to empty buffers, and an empty hash "matches"
  // every password.
  if (
    scheme !== "scrypt" ||
    !SALT_PATTERN.test(saltHex ?? "") ||
    !HASH_PATTERN.test(hashHex ?? "")
  ) {
    return false;
  }

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  const derived = await scrypt(
    password,
    Buffer.from(saltHex, "hex"),
    KEY_LENGTH,
  );

  return timingSafeEqual(derived, expected);
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
