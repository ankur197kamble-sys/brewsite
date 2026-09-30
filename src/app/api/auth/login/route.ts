import { findUserByEmail } from "@/app/db/auth";
import { fakePasswordVerify, verifyPassword } from "@/app/lib/auth";
import { startSession } from "@/app/lib/session";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";
import { asRecord } from "@/app/lib/json";

export async function POST(request: Request) {
  try {
    const body = asRecord(await readJsonBody(request));

    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return apiError("Email and password are required", 400);
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

    await startSession(user.id);

    return apiSuccess({ email: user.email });
  } catch (error) {
    console.error("Login failed:", error);
    return apiError("Login failed", 500);
  }
}
