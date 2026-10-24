import { headers } from "next/headers";

/**
 * The address this request came in on, e.g. "https://coffee-gruham.vercel.app",
 * so table QR codes point at whichever domain the café actually uses. Only
 * shown to the signed-in owner, on their own dashboard.
 */
export async function requestOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = list.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}
