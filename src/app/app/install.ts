"use client";

import { useSyncExternalStore } from "react";

/**
 * Android Chrome offers installing the app with a `beforeinstallprompt`
 * event, fired once per page load and often before the customer reaches the
 * Home screen (they usually arrive by QR code on the menu). It is caught
 * here, as soon as any customer screen loads this module, and kept for the
 * Install button on Home.
 */

export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let captured: InstallEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    captured = event as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    captured = null;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The browser's install offer, or null when there is none (or it was used). */
export function useInstallEvent(): InstallEvent | null {
  return useSyncExternalStore(
    subscribe,
    () => captured,
    () => null,
  );
}

/** The offer can be used once; forget it after prompting. */
export function forgetInstallEvent() {
  captured = null;
  notify();
}
