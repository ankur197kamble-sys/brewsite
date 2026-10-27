import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getActiveTableByToken } from "@/app/db/orders";
import { getPublicCafeId } from "@/app/lib/tenant";
import { withRetry } from "@/app/app/data";
import { AppUnavailable } from "@/app/app/unavailable";
import { appFonts } from "@/app/app/fonts";
import { RememberTable } from "./remember-table";

export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: "#1e140f" };

export const metadata: Metadata = {
  title: "Order at your table",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

/**
 * Where a table's QR code points. A valid code is remembered on the phone
 * and the customer goes straight to the menu to order. Only tables of the
 * café this app serves count: the menu shown next is that café's menu.
 */
export default async function TableLanding({ params }: Props) {
  const { token } = await params;
  let table: Awaited<ReturnType<typeof getActiveTableByToken>> | undefined;
  try {
    const found = /^[A-Za-z0-9_-]{16,64}$/.test(token)
      ? await withRetry(() => getActiveTableByToken(token))
      : undefined;
    table = found?.cafeId === getPublicCafeId() ? found : undefined;
  } catch {
    // A network blip is not a dead QR code: offer a retry instead.
    return (
      <div className={`app-theme ${appFonts} min-h-dvh`}>
        <div className="mx-auto max-w-md">
          <AppUnavailable />
        </div>
      </div>
    );
  }

  if (!table) {
    return (
      <main className={`app-theme ${appFonts} flex min-h-dvh items-center justify-center px-6 text-center`}>
        <div className="max-w-sm">
          <p className="app-label">QR code not recognised</p>
          <h1 className="app-title mt-3">This code is no longer active</h1>
          <p className="app-muted mt-4 leading-7">
            Please ask the staff for help. You can still browse the menu.
          </p>
          <Link href="/app/menu" className="app-btn app-btn-primary mt-8">
            Browse the menu
          </Link>
        </div>
      </main>
    );
  }

  return <RememberTable token={table.token} label={table.label} />;
}
