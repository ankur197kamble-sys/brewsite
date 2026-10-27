import type { NextConfig } from "next";
import { IMAGE_SOURCES } from "./src/app/lib/image-hosts";
import { isPreview } from "./src/app/lib/site-mode";

const nextConfig: NextConfig = {
  images: {
    // 75 is the default; 90 is used for the customer app's hero photo, where
    // compression shows most under the dark sunset shade.
    qualities: [75, 90],
    // Derived from the same allowlist the café API validates against, so an
    // owner can never save an image URL this renderer would reject. The
    // upload bucket is limited to its /cafes/ prefix with no query string.
    remotePatterns: IMAGE_SOURCES.map(({ hostname, pathPrefix, noQuery }) => ({
      protocol: "https" as const,
      hostname,
      ...(pathPrefix ? { pathname: `${pathPrefix}**` } : {}),
      ...(noQuery ? { search: "" } : {}),
    })),
  },

  async headers() {
    // The service worker must never be cached, or phones keep running an old
    // version (per the Next.js PWA guide).
    const serviceWorker = {
      source: "/sw.js",
      headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
      ],
    };
    // Preview mode: keep every response (pages and optimised images alike)
    // out of search results. See src/app/lib/site-mode.ts.
    if (!isPreview) return [serviceWorker];
    return [
      serviceWorker,
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
