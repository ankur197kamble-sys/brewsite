import { createTable, listTables } from "@/app/db/orders";
import { getCafeSession } from "@/app/lib/session";
import { validateTableLabel } from "@/app/lib/orders";
import { asRecord } from "@/app/lib/json";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";

const MAX_TABLES = 100;

export async function GET() {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);
    return apiSuccess({ tables: await listTables(session.cafeId) });
  } catch (error) {
    console.error("Failed to load tables:", error);
    return apiError("Failed to load tables", 500);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const label = validateTableLabel(asRecord(await readJsonBody(request))?.label);
    if (!label.ok) return apiError(label.error, 400);

    if ((await listTables(session.cafeId)).length >= MAX_TABLES) {
      return apiError(`A café can have at most ${MAX_TABLES} tables`, 400);
    }
    return apiSuccess(await createTable(session.cafeId, label.value), 201);
  } catch (error) {
    console.error("Failed to create table:", error);
    return apiError("Failed to create table", 500);
  }
}
