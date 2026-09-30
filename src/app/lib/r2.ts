import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 object storage for café photos, over its S3-compatible API.
 *
 * Server-only: this reads the R2 secret key. Never import it from a client
 * component. Credentials come from environment variables and are never sent
 * to the browser; visitors load photos from the bucket's public URL instead.
 */

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

let client: { aws: AwsClient; config: R2Config } | null = null;

function getClient() {
  if (client) return client;

  const config = readConfig();
  if (!config) return null;

  client = {
    config,
    aws: new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto",
    }),
  };
  return client;
}

export function isR2Configured(): boolean {
  return getClient() !== null;
}

function objectUrl(config: R2Config, key: string): string {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${path}`;
}

export class R2Error extends Error {}

/** Includes aws4fetch's own retries on 5xx/429 responses. */
const R2_TIMEOUT_MS = 20_000;

/**
 * Stores an object. Keys are unique per upload, so the object can be cached
 * forever by browsers and the image optimiser.
 */
export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const r2 = getClient();
  if (!r2) throw new R2Error("R2 is not configured");

  const response = await r2.aws.fetch(objectUrl(r2.config, key), {
    method: "PUT",
    // Bounded, so a hung storage request cannot hold the upload open.
    signal: AbortSignal.timeout(R2_TIMEOUT_MS),
    body: body as unknown as BodyInit,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });

  if (!response.ok) {
    throw new R2Error(`R2 PUT failed with ${response.status}`);
  }
}

/** Deletes an object. Deleting a key that does not exist is not an error. */
export async function deleteObject(key: string): Promise<void> {
  const r2 = getClient();
  if (!r2) throw new R2Error("R2 is not configured");

  const response = await r2.aws.fetch(objectUrl(r2.config, key), {
    method: "DELETE",
    signal: AbortSignal.timeout(R2_TIMEOUT_MS),
  });

  if (!response.ok && response.status !== 404) {
    throw new R2Error(`R2 DELETE failed with ${response.status}`);
  }
}
