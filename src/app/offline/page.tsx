import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/** Shown by the service worker when a page cannot load without a connection. */
export default function Offline() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f3eee5] px-6 text-center text-[#201a16]">
      <div className="max-w-sm">
        <p className="eyebrow text-[#b56e45]">No connection</p>
        <h1 className="font-display mt-4 text-4xl">You are offline</h1>
        <p className="mt-4 leading-7 text-[#756a60]">
          Check your mobile data or Wi-Fi, then try again. Your cart is saved on this phone.
        </p>
        <a href="/app" className="button-primary mt-8">
          Try again
        </a>
      </div>
    </main>
  );
}
