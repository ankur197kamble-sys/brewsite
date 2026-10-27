"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveTable } from "@/app/app/storage";
// Imported for its side effect: catches the app-install offer from the first page.
import "@/app/app/install";

/** Remembers the scanned table on this phone, then opens the menu. */
export function RememberTable({ token, label }: { token: string; label: string }) {
  const router = useRouter();

  useEffect(() => {
    saveTable(token, label);
    router.replace("/app/menu");
  }, [token, label, router]);

  return (
    <main className="app-theme flex min-h-dvh items-center justify-center px-6 text-center">
      <p role="status" className="text-lg">
        Opening the menu for <strong>{label}</strong>…
      </p>
    </main>
  );
}
