/**
 * Photo upload rules shared by the dashboard (which prepares files) and the
 * upload API (which enforces them). Free of server-only imports.
 */

/**
 * Hosting platforms cap request bodies at about 4.5 MB (Vercel), so the
 * browser downsizes photos before sending and the server rejects anything
 * larger than this.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Longest edge the browser resizes photos to before uploading. */
export const MAX_UPLOAD_DIMENSION = 2400;

/** Per café, per rolling 24 hours — generous for real use, caps abuse. */
export const DAILY_UPLOAD_LIMIT = 100;

export type UploadImageType = "image/jpeg" | "image/png" | "image/webp";

export const UPLOAD_EXTENSIONS: Record<UploadImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Identifies an image from its first bytes rather than trusting the file name
 * or the browser-supplied type, which an attacker controls. Anything else —
 * SVG (which can carry script), GIF, HEIC, HTML renamed to .jpg — is refused.
 */
export function sniffImageType(bytes: Uint8Array): UploadImageType | null {
  const startsWith = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte);

  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // "RIFF" <4-byte size> "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}
