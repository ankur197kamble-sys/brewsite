import { headers } from "next/headers";

/**
 * The address this request came in on, e.g. "https://coffee-gruham.vercel.app",
 * so table QR codes point at whichever domain the café actually uses. Only
 * shown to the signed-in owner, on their own dashboard.
 */
/**
 * True for addresses that only work on this computer or this local network
 * (a developer's machine, a LAN IP). QR codes printed with them would not
 * open on customers' phones.
 */
export function isLocalOrigin(origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return true;
  }
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

export async function requestOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = list.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}
