/**
 * Small helpers for reading untrusted JSON. Kept free of server-only imports
 * so validation code can be shared with client components.
 */

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Parse a Postgres array-literal string, e.g. `{"24 Market Street",London}`,
 * into its elements. Returns null if `value` isn't wrapped in `{}`.
 * Some drivers write `text[]`-shaped values this way when a JS array is
 * passed straight into a `text` column.
 */
function parsePostgresArrayLiteral(value: string): string[] | null {
  if (!(value.startsWith("{") && value.endsWith("}"))) return null;

  const inner = value.slice(1, -1);
  if (inner.length === 0) return [];

  const items: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];

    if (char === '"' && inner[i - 1] !== "\\") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      items.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  items.push(current.trim());
  return items;
}

/**
 * List columns (`address`, `gallery_images`, `hours`) are stored as `text`,
 * and have historically held plain strings, JSON-array strings, Postgres
 * array literals, and (via some drivers) real arrays. Normalize any of those
 * into a clean string[], falling back to static demo data when the value is
 * missing or unusable.
 */
export function normalizeStringList(
  value: unknown,
  fallback: string[],
): string[] {
  if (Array.isArray(value)) {
    const lines = value.filter(isNonEmptyString);
    return lines.length > 0 ? lines : fallback;
  }

  if (isNonEmptyString(value)) {
    const trimmed = value.trim();

    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const lines = parsed.filter(isNonEmptyString);
          return lines.length > 0 ? lines : fallback;
        }
      } catch {
        // Not valid JSON — fall through and try other formats.
      }
    }

    if (trimmed.startsWith("{")) {
      const parsed = parsePostgresArrayLiteral(trimmed);
      if (parsed) {
        const lines = parsed.filter(isNonEmptyString);
        if (lines.length > 0) return lines;
      }
    }

    return [trimmed];
  }

  return fallback;
}

/** Encode a string[] for storage in a text list column. */
export function serializeStringList(lines: string[]): string {
  return JSON.stringify(lines);
}
