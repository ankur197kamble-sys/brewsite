"use client";

import { useEffect, useTransition } from "react";

/** A dashboard page failed (usually a brief database or network blip). */
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [retrying, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="max-w-xl rounded-2xl border border-black/10 bg-white/60 p-6 md:p-8">
      <p className="text-sm tracking-[0.25em] text-black/55 uppercase">Connection problem</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">This page didn&apos;t load</h1>
      <p className="mt-3 leading-7 text-black/65">
        The dashboard couldn&apos;t reach the database just now. Nothing was changed. Try again in a moment.
      </p>
      <button
        type="button"
        onClick={() => startTransition(() => retry())}
        disabled={retrying}
        className="mt-6 min-h-12 rounded-full bg-[#1f1a17] px-6 font-semibold text-white transition hover:opacity-85 disabled:opacity-50"
      >
        {retrying ? "Trying…" : "Try again"}
      </button>
    </div>
  );
}
