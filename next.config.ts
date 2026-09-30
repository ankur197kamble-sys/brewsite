import type { NextConfig } from "next";
import { IMAGE_SOURCES } from "./src/app/lib/image-hosts";

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
};

export default nextConfig;
