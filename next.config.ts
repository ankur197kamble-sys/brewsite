import type { NextConfig } from "next";
import { ALLOWED_IMAGE_HOSTS } from "./src/app/lib/image-hosts";

const nextConfig: NextConfig = {
  images: {
    // Derived from the same allowlist the café API validates against, so an
    // owner can never save an image URL this renderer would reject.
    remotePatterns: ALLOWED_IMAGE_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
  },
};

export default nextConfig;
