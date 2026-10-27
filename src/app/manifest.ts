import type { MetadataRoute } from "next";
import { getCafe } from "@/app/db/cafe";
import { cafe as fallbackCafe } from "@/app/data/cafe";
import { getSiteCafe } from "@/app/lib/site-cafe";
import { getPublicCafeId } from "@/app/lib/tenant";
import { withRetry } from "@/app/app/data";

// Built per request from the café's own name, never from a hard-coded brand.
export const dynamic = "force-dynamic";

/** Home-screen labels show about 15 characters before they are cut off. */
const HOME_SCREEN_CHARS = 15;

/**
 * The label under the app icon: the whole name when it fits ("Coffee
 * Gruham"), else as many whole words as fit ("Coffee Gruham Badlapur" ->
 * "Coffee Gruham"), never just a generic first word like "Coffee".
 */
function homeScreenName(name: string): string {
  if (name.length <= HOME_SCREEN_CHARS) return name;
  let label = "";
  for (const word of name.split(/\s+/)) {
    const next = label ? `${label} ${word}` : word;
    if (next.length > HOME_SCREEN_CHARS) break;
    label = next;
  }
  return label || name.slice(0, HOME_SCREEN_CHARS).trim();
}

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
    short_name: homeScreenName(site.name),
    description: site.highlights ?? site.tagline,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1e140f",
    theme_color: "#1e140f",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
