/** Small request/response helpers for /api/relevance. No Next.js imports so they stay testable. */

const ALLOWED_HEADERS = "Content-Type, X-DriftGuard-Install, X-DriftGuard-Version";

/**
 * Extensions call from `chrome-extension://<id>`. Local dev pages (localhost / 127.0.0.1) are
 * allowed only when `dev` is true. Requests with no Origin (curl, server-to-server) are allowed
 * through; CORS only matters to browsers.
 */
export function isAllowedOrigin(origin: string | null, dev: boolean): boolean {
  if (!origin) return true;
  if (/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return true;
  if (dev && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin)) return true;
  return false;
}

export function corsHeaders(origin: string | null, dev: boolean): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && isAllowedOrigin(origin, dev)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = ALLOWED_HEADERS;
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

/** First hop of X-Forwarded-For (set by Vercel's edge), then X-Real-IP. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export class BodyTooLarge extends Error {}

/**
 * Reads the body as UTF-8 text, aborting as soon as it passes `maxBytes`, so an oversized upload
 * (or a lying Content-Length) never gets buffered in full.
 */
export async function readBodyLimited(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}
