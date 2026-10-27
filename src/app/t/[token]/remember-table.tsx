"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveTable } from "@/app/app/storage";
import { IntroFlourish, markIntroSeen } from "@/app/app/intro";
import { scriptFont } from "@/app/app/script-font";
// Imported for its side effect: catches the app-install offer from the first page.
import "@/app/app/install";

/** Long enough to see the café's name and the table, short enough not to wait. */
const HOLD_MS = 1200;
const HOLD_REDUCED_MS = 600;

/**
 * Where a scanned QR code lands: the café's opening moment with the table's
 * name, while the table is remembered on this phone; then the menu opens.
 * It counts as the visit's intro, so the app does not play it again.
 */
export function RememberTable({
  token,
  label,
  cafeName,
  greeting,
}: {
  token: string;
  label: string;
  cafeName: string | null;
  greeting: string;
}) {
  const router = useRouter();

  useEffect(() => {
    saveTable(token, label);
    markIntroSeen();
    router.prefetch("/app/menu");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => router.replace("/app/menu"), reduced ? HOLD_REDUCED_MS : HOLD_MS);
    return () => clearTimeout(timer);
  }, [token, label, router]);

  return (
    <main className={`app-theme ${scriptFont} min-h-dvh`}>
      <p role="status" className="sr-only">
        Opening the menu for {label}
      </p>
      <div className="app-intro app-intro--stay" aria-hidden="true">
        {cafeName ? <p className="app-intro__name">{cafeName}</p> : null}
        <IntroFlourish />
        <p className="app-intro__detail">
          {greeting} · {label}
        </p>
      </div>
    </main>
  );
}
