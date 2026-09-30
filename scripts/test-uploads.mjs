/**
 * End-to-end check of photo uploads against a running dev server.
 *
 * Usage (with `npm run dev` already running):
 *   npm run test:uploads
 *
 * Without R2 credentials in .env.local it checks everything up to the storage
 * step (auth, validation, type sniffing, limits) and expects a clear 503.
 * With credentials it also stores a real photo, reads it back from the public
 * URL, saves it to the gallery, and deletes every object it created.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/app/db/index.ts";
import { uploads } from "../src/app/db/schema.ts";
import { deleteObject } from "../src/app/lib/r2.ts";
import { DAILY_UPLOAD_LIMIT, MAX_UPLOAD_BYTES, sniffImageType } from "../src/app/lib/uploads.ts";
import {
  BASE_URL,
  check,
  createTenant,
  expectStatus,
  finish,
  onCleanup,
  section,
  testCafeIds,
} from "./lib/harness.mjs";

const configured = Boolean(
  process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET &&
    process.env.NEXT_PUBLIC_UPLOADS_BASE_URL,
);

// A real 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
const WEBP_HEADER = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 ")];

async function upload(cookie, content, { type = "application/octet-stream", name = "photo", field = "file" } = {}) {
  const form = new FormData();
  if (content !== null) form.append(field, new Blob([content], { type }), name);

  const response = await fetch(`${BASE_URL}/api/uploads`, {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : {},
    body: form,
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

async function main() {
  console.log(configured ? "R2 is configured: running the full round trip." : "R2 is not configured: checking everything up to storage.");

  section("File type detection (unit)");
  check("PNG signature → image/png", sniffImageType(new Uint8Array(PNG)) === "image/png");
  check("JPEG signature → image/jpeg", sniffImageType(new Uint8Array(JPEG_HEADER)) === "image/jpeg");
  check("WebP signature → image/webp", sniffImageType(new Uint8Array(WEBP_HEADER)) === "image/webp");
  check("SVG → rejected", sniffImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")) === null);
  check("GIF → rejected", sniffImageType(new TextEncoder().encode("GIF89a")) === null);
  check("RIFF that is not WebP (WAV) → rejected", sniffImageType(new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")])) === null);
  check("empty → rejected", sniffImageType(new Uint8Array()) === null);

  section("Unauthenticated");
  expectStatus("POST /api/uploads → 401", await upload(null, PNG), 401);

  const a = await createTenant("Uploads A");

  section("Validation (café A)");
  const notMultipart = await fetch(`${BASE_URL}/api/uploads`, {
    method: "POST",
    headers: { Cookie: a.cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ file: "x" }),
  });
  expectStatus("JSON body instead of a file → 400", { status: notMultipart.status }, 400);
  expectStatus("form without a file → 400", await upload(a.cookie, null), 400);
  expectStatus("file in the wrong field → 400", await upload(a.cookie, PNG, { field: "photo" }), 400);
  expectStatus("empty file → 400", await upload(a.cookie, new Uint8Array()), 400);
  expectStatus(
    "SVG labelled as JPEG → 415",
    await upload(a.cookie, "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", { type: "image/jpeg", name: "x.jpg" }),
    415,
  );
  expectStatus("HTML renamed to .png → 415", await upload(a.cookie, "<html><body>hi</body></html>", { type: "image/png", name: "x.png" }), 415);
  expectStatus("GIF → 415", await upload(a.cookie, "GIF89a\x01\x00\x01\x00", { type: "image/gif", name: "x.gif" }), 415);

  const justOver = new Uint8Array(MAX_UPLOAD_BYTES + 1);
  justOver.set(JPEG_HEADER);
  expectStatus("file 1 byte over the limit → 413", await upload(a.cookie, justOver, { type: "image/jpeg" }), 413);
  const wayOver = new Uint8Array(MAX_UPLOAD_BYTES + 1024 * 1024);
  wayOver.set(JPEG_HEADER);
  expectStatus("body far over the limit → 413", await upload(a.cookie, wayOver, { type: "image/jpeg" }), 413);

  // A streamed (chunked) body carries no Content-Length, so the size must be
  // enforced while reading. 6 MB in 64 KB chunks, never declaring a length.
  const chunk = new Uint8Array(64 * 1024);
  let sent = 0;
  const endless = new ReadableStream({
    pull(controller) {
      if (sent >= 6 * 1024 * 1024) return controller.close();
      sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  const chunked = await fetch(`${BASE_URL}/api/uploads`, {
    method: "POST",
    headers: { Cookie: a.cookie, "Content-Type": "multipart/form-data; boundary=x" },
    body: endless,
    duplex: "half",
  }).catch((error) => ({ status: `network error: ${error.message}` }));
  expectStatus("chunked body over the limit, no Content-Length → 413", { status: chunked.status }, 413);

  if (!configured) {
    section("Storage not configured");
    const result = await upload(a.cookie, PNG, { type: "text/plain", name: "notes.txt" });
    expectStatus("valid photo (even with a misleading type) → 503", result, 503);
    check("explains that uploads are not set up", (result.json?.message ?? "").includes("not set up"));
  } else {
    section("Round trip through R2 (café A)");
    const result = await upload(a.cookie, PNG, { type: "text/plain", name: "../../cafes/999/evil.txt" });
    expectStatus("valid PNG (misleading type and name) → 201", result, 201);
    const url = result.json?.data?.url ?? "";
    const base = new URL(process.env.NEXT_PUBLIC_UPLOADS_BASE_URL).origin;
    check("URL is under this café's folder", url.startsWith(`${base}/cafes/${a.cafeId}/`), url);
    check("stored as .png from the sniffed type", url.endsWith(".png"));
    const keyPattern = new RegExp(`^/cafes/${a.cafeId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.png$`);
    const keyPath = new URL(url).pathname;
    check("key is cafes/<café>/<uuid>.png — nothing from the client", keyPattern.test(keyPath), keyPath);

    const [row] = await db.select().from(uploads).where(eq(uploads.url, url));
    check("upload is recorded for café A", row?.cafeId === a.cafeId && row?.sizeBytes === PNG.length && row?.contentType === "image/png");

    const served = await fetch(url);
    const servedBytes = Buffer.from(await served.arrayBuffer());
    check("public URL serves the photo → 200", served.status === 200, `got ${served.status}`);
    check("served bytes match the upload", servedBytes.equals(PNG));
    check("served with image/png", (served.headers.get("content-type") ?? "").startsWith("image/png"));

    const saved = await fetch(`${BASE_URL}/api/gallery`, {
      method: "POST",
      headers: { Cookie: a.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ url, alt: "Uploaded test photo" }),
    });
    expectStatus("uploaded URL can be saved to the gallery → 201", { status: saved.status }, 201);

    const outsidePrefix = await fetch(`${BASE_URL}/api/gallery`, {
      method: "POST",
      headers: { Cookie: a.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${base}/private/secret.png` }),
    });
    expectStatus("bucket URL outside /cafes/ is rejected → 400", { status: outsidePrefix.status }, 400);

    const withQuery = await fetch(`${BASE_URL}/api/gallery`, {
      method: "POST",
      headers: { Cookie: a.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${url}?v=1` }),
    });
    expectStatus("bucket URL with a query string is rejected → 400", { status: withQuery.status }, 400);

    const optimised = await fetch(`${BASE_URL}/_next/image?url=${encodeURIComponent(url)}&w=640&q=75`);
    check("next/image serves the uploaded photo → 200", optimised.status === 200, `got ${optimised.status}`);
  }

  section("Daily limit (café A)");
  const now = new Date();
  await db.insert(uploads).values(
    Array.from({ length: DAILY_UPLOAD_LIMIT }, (_, index) => ({
      cafeId: a.cafeId,
      key: `test-quota/${a.cafeId}/${index}-${now.getTime()}`,
      url: "https://example.invalid/quota",
      contentType: "image/png",
      sizeBytes: 1,
    })),
  );
  const limited = await upload(a.cookie, PNG);
  expectStatus(`upload #${DAILY_UPLOAD_LIMIT + 1} in a day → 429`, limited, 429);

  const b = await createTenant("Uploads B");
  const other = await upload(b.cookie, PNG);
  check("another café is not affected by A's limit", other.status === (configured ? 201 : 503), `got ${other.status}`);
}

// Delete the real objects this run stored in R2 before the test cafés (and
// with them their upload rows) are removed.
onCleanup(async () => {
  const cafeIds = testCafeIds();
  if (!configured || cafeIds.length === 0) return;

  const rows = await db
    .select({ key: uploads.key })
    .from(uploads)
    .where(inArray(uploads.cafeId, cafeIds));

  for (const { key } of rows) {
    if (key.startsWith("cafes/")) await deleteObject(key);
  }
});

await finish(main);
