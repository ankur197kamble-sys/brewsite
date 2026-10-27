import {
  claimLoginAttempt,
  clearLoginAttempts,
  findUserByEmail,
  forgetLoginAttempt,
  LOGIN_WINDOW_MINUTES,
} from "@/app/db/auth";
import { fakePasswordVerify, verifyPassword } from "@/app/lib/auth";
import { startSession } from "@/app/lib/session";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";
import { asRecord } from "@/app/lib/json";
import { logError } from "@/app/lib/log";
import { clientAddress, secretHash } from "@/app/lib/secret-hash";

/**
 * Sign-in attempts allowed per LOGIN_WINDOW_MINUTES before sign-in pauses:
 * - one account from one network: the tight limit on password guessing;
 * - one account from anywhere: a ceiling against guessing spread over many
 *   networks, set high so a stranger cannot lock the owner out;
 * - one network, across all accounts: stops trying many emails at once.
 */
const MAX_ATTEMPTS_PER_ACCOUNT_AND_NETWORK = 5;
const MAX_ATTEMPTS_PER_ACCOUNT = 50;
const MAX_ATTEMPTS_PER_NETWORK = 20;
/** Longer passwords are refused before any hashing work is done. */
const MAX_PASSWORD_LENGTH = 256;

export async function POST(request: Request) {
  try {
    const body = asRecord(await readJsonBody(request));

    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return apiError("Email and password are required", 400);
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      return apiError("Invalid email or password", 401);
    }

    // Password guessing is slowed down before any expensive hashing, so
    // repeated tries cost the server little. Successful sign-ins and refused
    // attempts are taken off the count again; failures stay for the window.
    const address = clientAddress(request);
    const keys = {
      pair: secretHash(`login-pair:${email}|${address}`),
      email: secretHash(`login-email:${email}`),
      ip: secretHash(`login-ip:${address}`),
    };
    const attempt = await claimLoginAttempt(keys);
    if (
      attempt.counts.pair > MAX_ATTEMPTS_PER_ACCOUNT_AND_NETWORK ||
      attempt.counts.email > MAX_ATTEMPTS_PER_ACCOUNT ||
      attempt.counts.ip > MAX_ATTEMPTS_PER_NETWORK
    ) {
      await forgetLoginAttempt(attempt);
      return apiError(
        `Too many sign-in attempts. Please wait ${LOGIN_WINDOW_MINUTES} minutes and try again.`,
        429,
      );
    }

    const user = await findUserByEmail(email);

    // One generic message and comparable timing either way, so the response
    // never reveals whether an account exists.
    if (!user) {
      await fakePasswordVerify(password);
      return apiError("Invalid email or password", 401);
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      return apiError("Invalid email or password", 401);
    }

    await clearLoginAttempts(keys, attempt);
    await startSession(user.id);

    return apiSuccess({ email: user.email });
  } catch (error) {
    logError("Login failed:", error);
    return apiError("Login failed", 500);
  }
}
