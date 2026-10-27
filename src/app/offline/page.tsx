import type { Metadata, Viewport } from "next";
import { appFonts } from "@/app/app/fonts";

export const viewport: Viewport = { themeColor: "#1e140f" };

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * Shown by the service worker in place of a customer-app page that could not
 * load without a connection. The address bar still shows the page that
 * failed, so "Try again" simply reloads it (an empty href is the current
 * address, and works without JavaScript).
 */
export default function Offline() {
  return (
    <main className={`app-theme ${appFonts} flex min-h-dvh items-center justify-center px-6 text-center`}>
      <div className="max-w-sm">
        <p className="app-label">No connection</p>
        <h1 className="app-title mt-3">You&apos;re offline</h1>
        <p className="app-muted mt-4 leading-7">
          Check your mobile data or Wi-Fi, then try again. Anything already in your order is kept on this phone.
        </p>
        <a href="" className="app-btn app-btn-primary mt-8">
          Try again
        </a>
      </div>
    </main>
  );
}
