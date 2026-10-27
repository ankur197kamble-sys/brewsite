import { deleteTable, updateTable, type TablePatch } from "@/app/db/orders";
import { getCafeSession } from "@/app/lib/session";
import { validateTableLabel } from "@/app/lib/orders";
import { asRecord } from "@/app/lib/json";
import { parseId } from "@/app/lib/validation";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";
import { logError } from "@/app/lib/log";

type Context = { params: Promise<{ id: string }> };

/** `{ label }`, `{ isActive }` or `{ newToken: true }` (replaces the QR code). */
export async function PATCH(request: Request, context: Context) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const tableId = parseId((await context.params).id);
    if (tableId === null) return apiError("Invalid table id", 400);

    const body = asRecord(await readJsonBody(request));
    if (!body) return apiError("Invalid request body", 400);

    const patch: TablePatch = {};
    if (body.label !== undefined) {
      const label = validateTableLabel(body.label);
      if (!label.ok) return apiError(label.error, 400);
      patch.label = label.value;
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") return apiError("isActive must be true or false", 400);
      patch.isActive = body.isActive;
    }
    if (body.newToken !== undefined) {
      if (body.newToken !== true) return apiError("newToken must be true", 400);
      patch.newToken = true;
    }
    if (Object.keys(patch).length === 0) return apiError("Nothing to update", 400);

    const table = await updateTable(session.cafeId, tableId, patch);
    if (!table) return apiError("Table not found", 404);
    return apiSuccess(table);
  } catch (error) {
    logError("Failed to update table:", error);
    return apiError("Failed to update table", 500);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const tableId = parseId((await context.params).id);
    if (tableId === null) return apiError("Invalid table id", 400);

    if (!(await deleteTable(session.cafeId, tableId))) return apiError("Table not found", 404);
    return apiSuccess({ deleted: true });
  } catch (error) {
    logError("Failed to delete table:", error);
    return apiError("Failed to delete table", 500);
  }
}
