import { encode } from "uqr";

type Props = {
  value: string;
  /** Rendered width and height in CSS pixels. */
  size?: number;
  className?: string;
  /** Accessible description, e.g. "QR code for Table 1". */
  label: string;
};

/** Modules of white margin around the code; scanners need at least 4. */
const QUIET_ZONE = 4;

/**
 * A QR code drawn as a single SVG path. Rendered from data, not from an
 * HTML string, so there is no injection surface. Works on the server and in
 * the browser, and prints crisply at any size.
 */
export function QrCode({ value, size = 200, className = "", label }: Props) {
  const { data, size: modules } = encode(value, { ecc: "M" });
  const total = modules + QUIET_ZONE * 2;

  let path = "";
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    });
  });

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path} fill="#111111" />
    </svg>
  );
}
