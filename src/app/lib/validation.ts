import { asRecord } from "@/app/lib/json";

/**
 * Validation primitives shared by every dashboard feature, so menu, gallery
 * and anything added later agree on ids, ordering and result shapes.
 */

export type Validated<T> =
  { ok: true; value: T } | { ok: false; error: string };

export function invalid<T>(error: string): Validated<T> {
  return { ok: false, error };
}

export type MoveDirection = "up" | "down";

/**
 * Outcome of a one-step move. "not_found" covers ids that belong to another
 * café, so a cross-tenant move answers 404 exactly like every other
 * cross-tenant request; "edge" means the row is already first or last;
 * "conflict" means the list changed underneath the move (a concurrent add
 * or delete), so the caller should refresh and retry.
 */
export type MoveResult = "moved" | "edge" | "not_found" | "conflict";

/** Accepts a route param string or a JSON number; rejects anything else. */
export function parseId(value: unknown): number | null {
  const id = typeof value === "string" ? Number(value) : value;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) return null;
  return id;
}

/** Reorder requests are expressed as `{ move: "up" | "down" }`. */
export function parseMoveDirection(body: unknown): MoveDirection | null {
  const record = asRecord(body);
  if (!record) return null;
  if (record.move === "up" || record.move === "down") return record.move;
  return null;
}
