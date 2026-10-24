"use client";

import { useEffect } from "react";
import { AppUnavailable } from "./unavailable";

/** Any unexpected failure inside the customer app: keep the tab bar, offer a retry. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <AppUnavailable onRetry={retry} />;
}
