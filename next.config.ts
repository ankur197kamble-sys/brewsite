import type { NextConfig } from "next";
import { IMAGE_SOURCES } from "./src/app/lib/image-hosts";
import { isPreview } from "./src/app/lib/site-mode";

const nextConfig: NextConfig = {
  images: {
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
    // Preview mode: keep every response (pages and optimised images alike)
    // out of search results. See src/app/lib/site-mode.ts.
    if (!isPreview) return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
