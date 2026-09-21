import { NextResponse } from "next/server";

/** Shared response shape for every BrewSite API route. */
export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

/** Returns null for a missing or malformed JSON body. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
