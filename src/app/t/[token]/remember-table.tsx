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
    <main className="flex min-h-dvh items-center justify-center bg-[#f3eee5] px-6 text-center text-[#201a16]">
      <p role="status" className="text-lg">
        Opening the menu for <strong>{label}</strong>…
      </p>
    </main>
  );
}
