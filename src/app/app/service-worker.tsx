"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js. It only provides an offline screen for page loads
 * that fail without a connection; it caches no data, so customers never see
 * a stale menu or order status.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Not critical: the app works without it, just with no offline screen.
    });
  }, []);
  return null;
}
