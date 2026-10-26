import { isLocalOrigin } from "@/app/lib/origin";

/**
 * Shown when the dashboard is opened on a local address (for example while
 * developing on a laptop): QR codes made here would point to that address,
 * which customers' phones cannot open.
 */
export function OriginWarning({ origin }: { origin: string }) {
  if (!isLocalOrigin(origin)) return null;
  return (
    <p className="mb-6 rounded-xl border border-amber-700/30 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950 print:hidden">
      <strong>Don&apos;t print these QR codes.</strong> They point to {origin}, which only works on this computer
      or network. Open the dashboard on the live site to print codes customers can scan.
    </p>
  );
}
