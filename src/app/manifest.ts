import type { MetadataRoute } from "next";
import { getCafe } from "@/app/db/cafe";
import { cafe as fallbackCafe } from "@/app/data/cafe";
import { getSiteCafe } from "@/app/lib/site-cafe";
import { getPublicCafeId } from "@/app/lib/tenant";
import { withRetry } from "@/app/app/data";

// Built per request from the café's own name, never from a hard-coded brand.
export const dynamic = "force-dynamic";

/**
 * Makes the customer app installable ("Add to Home screen"). If the café
 * cannot be read it fails (the browser simply tries again later) rather than
 * letting a phone install the app under a demo name.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const dbCafe = await withRetry(() => getCafe(getPublicCafeId()));
  if (!dbCafe) throw new Error("Café not found");
  const site = getSiteCafe(dbCafe, fallbackCafe);

  return {
    id: "/app",
    name: site.name,
    short_name: site.name.length > 12 ? site.name.split(" ")[0] : site.name,
    description: site.highlights ?? site.tagline,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3eee5",
    theme_color: "#201a16",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
