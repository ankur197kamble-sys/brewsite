import { ImageResponse } from "next/og";
import { loadCafeName } from "@/app/app/data";

const SIZES = new Set([180, 192, 512]);

type Context = { params: Promise<{ size: string }> };

/** "Coffee Gruham" -> "CG"; one-word names use their first two letters. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "C").slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The home-screen icon, drawn from the café's name, so every café on the
 * platform gets its own icon with no design work. The mark sits well inside
 * the safe zone, so it also works as a "maskable" (rounded or circle) icon.
 */
export async function GET(_request: Request, context: Context) {
  const size = Number((await context.params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });

  // Icons are cached for a day: never draw (and cache) a demo name.
  const name = await loadCafeName();
  if (!name) return new Response("Temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1e140f",
          color: "#f3e3d0",
          fontSize: size * 0.36,
          fontWeight: 700,
          letterSpacing: size * -0.01,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: size * 0.62,
            height: size * 0.62,
            borderRadius: "50%",
            border: `${Math.max(2, size * 0.018)}px solid #e2915a`,
          }}
        >
          {initials(name)}
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
