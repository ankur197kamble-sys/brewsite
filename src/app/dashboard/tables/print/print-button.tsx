"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-11 rounded-full bg-[#1f1a17] px-5 text-sm font-semibold text-white transition hover:opacity-85"
    >
      Print
    </button>
  );
}
