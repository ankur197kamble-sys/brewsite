import { NextResponse } from "next/server";

/** Shared response shape for every BrewSite API route. */
export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

/**
 * Returns null for a missing or malformed JSON body, and for any body not
 * sent as application/json. A plain HTML form on another website can post
 * text that looks like JSON, but cannot set this content type without the
 * browser first asking this site's permission, which it never gives.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type.trim())) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}
