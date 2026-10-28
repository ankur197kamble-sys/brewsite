import type { NextConfig } from "next";
import { OPTIMIZED_IMAGE_SOURCES } from "./src/app/lib/image-hosts";
import { isPreview } from "./src/app/lib/site-mode";

const nextConfig: NextConfig = {
  images: {
    // 75 is the default; 90 is used for the customer app's hero photo, where
    // compression shows most under the dark sunset shade.
    qualities: [75, 90],
    // Only the café's uploaded photos are resized here, limited to the
    // bucket's /cafes/ prefix with no query string. Pasted Unsplash links are
    // resized by Unsplash itself (see src/app/lib/image-hosts.ts).
    remotePatterns: OPTIMIZED_IMAGE_SOURCES.map(({ hostname, pathPrefix, noQuery }) => ({
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
    // Basic protection on every response:
    // - no other site may show these pages inside a frame (stops "clickjacking",
    //   e.g. a hidden dashboard under a fake button);
    // - browsers must not guess file types (stops a file being run as a script);
    // - other sites only learn our domain, never full addresses (order links
    //   carry private tokens);
    // - camera, microphone and location are never used, so they are switched off.
    const security = {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    };
    // Preview mode: keep every response (pages and optimised images alike)
    // out of search results. See src/app/lib/site-mode.ts.
    if (!isPreview) return [security, serviceWorker];
    return [
      security,
      serviceWorker,
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
