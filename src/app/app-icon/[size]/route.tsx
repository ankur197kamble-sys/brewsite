import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

/** The dusk background. The manifest's splash colour is the same, so on the
 *  splash screen the icon's square edges disappear into the screen. */
const DUSK = "#1e140f";

type Context = { params: Promise<{ size: string }> };

/**
 * The emblem from the opening intro: a coffee cup with rising steam inside a
 * ring of coffee beans, lit by a soft sunset glow. Drawn as vector art at
 * 512 units, so it is crisp at every size. `scale` shrinks the emblem for
 * the maskable icon, where the launcher may crop up to the outer 20%.
 */
function emblemSvg(scale: number): string {
  const beans = Array.from({ length: 12 }, (_, index) => index * 30)
    .map(
      (angle) => `<g transform="rotate(${angle}) translate(0 -150)">
        <ellipse rx="15" ry="21" fill="#5a3524" stroke="#e2915a" stroke-width="2.4"/>
        <path d="M -2.4 -17 C 6 -6, -6 6, 2.4 17" fill="none" stroke="#f3e3d0" stroke-opacity="0.6" stroke-width="2.2"/>
      </g>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="glow" cx="50%" cy="58%" r="46%">
      <stop offset="0" stop-color="#e08a50" stop-opacity="0.55"/>
      <stop offset="0.55" stop-color="#b9643a" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#b9643a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="${DUSK}"/>
  <circle cx="256" cy="268" r="236" fill="url(#glow)"/>
  <g transform="translate(256 256) scale(${scale})">
    <circle r="196" fill="none" stroke="#f3e3d0" stroke-opacity="0.16" stroke-width="2"/>
    ${beans}
    <circle r="114" fill="none" stroke="#e2915a" stroke-opacity="0.5" stroke-width="3" stroke-dasharray="3 10" stroke-linecap="round"/>
    <g fill="none" stroke="#f3e3d0" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M -50 -4 L -41 54 C -38 68, -26 74, -12 74 L 12 74 C 26 74, 38 68, 41 54 L 50 -4 Z"/>
      <path d="M 48 10 C 76 7, 79 42, 44 45"/>
      <path d="M -76 86 C -44 98, 44 98, 76 86"/>
    </g>
    <g fill="none" stroke="#f3e3d0" stroke-width="5" stroke-linecap="round" stroke-opacity="0.85">
      <path d="M -20 -20 C -34 -40, -6 -54, -20 -78"/>
      <path d="M 0 -24 C -14 -46, 14 -62, 0 -92"/>
      <path d="M 20 -20 C 6 -40, 34 -54, 20 -78"/>
    </g>
  </g>
</svg>`;
}

/**
 * The home-screen icon and, on Android, the splash screen's centrepiece.
 * The same emblem as the opening intro, so the splash flows straight into
 * the intro. `?maskable` gives the version with room for the launcher's
 * round or squircle crop.
 */
export async function GET(request: Request, context: Context) {
  const size = Number((await context.params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = new URL(request.url).searchParams.has("maskable");
  const svg = emblemSvg(maskable ? 0.74 : 0.92);
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: DUSK }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered to a PNG, not a page */}
        <img src={src} width={size} height={size} alt="" />
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
