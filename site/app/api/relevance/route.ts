/**
 * POST /api/relevance — the server half of the optional AI check (see /AI_CHECK.md).
 *
 * The extension sends the user's intention plus the page on screen; we ask a vision model via
 * OpenRouter whether the page is part of the task and return a small JSON verdict. The
 * OpenRouter key lives only here (server env), never in the client bundle or the extension.
 *
 * Privacy: nothing is stored, and request bodies / page text / screenshots are never logged.
 * Logs carry status, latency and model only.
 */
import { LIMITS, isInstallId, validateRelevanceRequest } from "@/lib/relevance/validate";
import { DEFAULT_FALLBACK_MODEL, DEFAULT_MODEL, buildChatBody } from "@/lib/relevance/prompt";
import { parseVerdict } from "@/lib/relevance/parse";
import { SlidingWindowLimiter } from "@/lib/relevance/rateLimit";
import { BodyTooLarge, clientIp, corsHeaders, isAllowedOrigin, readBodyLimited } from "@/lib/relevance/http";

// Node runtime (the default, stated explicitly). POST route handlers are never cached.
export const runtime = "nodejs";
export const maxDuration = 20;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const UPSTREAM_TIMEOUT_MS = 10_000;
const DEV = process.env.NODE_ENV === "development";

// Best-effort, per-instance limits (see lib/relevance/rateLimit.ts). On serverless each instance
// keeps its own counters, so these are a speed bump; the Vercel Firewall rule in DEPLOY.md is
// the real limit.
const installLimiter = new SlidingWindowLimiter([
  { limit: 30, windowMs: 60_000 },
  { limit: 600, windowMs: 86_400_000 },
]);
const ipLimiter = new SlidingWindowLimiter([{ limit: 60, windowMs: 60_000 }]);

function json(
  data: unknown,
  status: number,
  origin: string | null,
  extra: Record<string, string> = {},
): Response {
  return Response.json(data, {
    status,
    headers: { ...corsHeaders(origin, DEV), "Cache-Control": "no-store", ...extra },
  });
}

function log(status: number, started: number, model?: string) {
  // Status, latency and model only. Never the body, page text, URL or screenshot.
  console.log(JSON.stringify({ route: "relevance", status, ms: Date.now() - started, model: model ?? null }));
}

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, DEV)) {
    return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin, DEV) });
}

export async function POST(request: Request) {
  const started = Date.now();
  const origin = request.headers.get("origin");
  const reply = (data: unknown, status: number, extra?: Record<string, string>, model?: string) => {
    log(status, started, model);
    return json(data, status, origin, extra);
  };

  if (!isAllowedOrigin(origin, DEV)) return reply({ error: "forbidden_origin" }, 403);

  const install = request.headers.get("x-driftguard-install");
  if (!isInstallId(install)) return reply({ error: "bad_install_id" }, 400);

  // Rate limit before doing any work on the body. IP first so one address can't rotate install ids.
  const ipCheck = ipLimiter.hit(clientIp(request.headers));
  const check = ipCheck.ok ? installLimiter.hit(install.toLowerCase()) : ipCheck;
  if (!check.ok) {
    return reply({ error: "rate_limited", retryAfter: check.retryAfter }, 429, {
      "Retry-After": String(check.retryAfter),
    });
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > LIMITS.bodyBytes) return reply({ error: "too_large" }, 413);

  let raw: string;
  try {
    raw = await readBodyLimited(request.body, LIMITS.bodyBytes);
  } catch (err) {
    if (err instanceof BodyTooLarge) return reply({ error: "too_large" }, 413);
    return reply({ error: "bad_body" }, 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return reply({ error: "bad_json" }, 400);
  }

  const valid = validateRelevanceRequest(parsed);
  if (!valid.ok) return reply({ error: "bad_request", detail: valid.error }, 400);

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return reply({ error: "not_configured" }, 503);

  const primary = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const fallback = process.env.OPENROUTER_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;
  const siteUrl =
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");

  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(siteUrl ? { "HTTP-Referer": siteUrl } : {}),
        "X-Title": "DriftGuard",
      },
      body: JSON.stringify(buildChatBody(valid.value, primary, fallback)),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // Timeout or network failure. Deliberately not logging the error object (it can echo input).
    return reply({ error: "upstream_unavailable" }, 502);
  }

  let payload: { model?: unknown; error?: unknown; choices?: { message?: { content?: unknown } }[] };
  try {
    payload = await upstream.json();
  } catch {
    return reply({ error: "upstream_bad_response" }, 502);
  }

  const model = typeof payload.model === "string" ? payload.model : primary;
  if (!upstream.ok || payload.error) {
    console.log(JSON.stringify({ route: "relevance", upstreamStatus: upstream.status }));
    return reply({ error: "upstream_error" }, 502, undefined, model);
  }

  const verdict = parseVerdict(payload.choices?.[0]?.message?.content);
  if (!verdict) return reply({ error: "upstream_unparseable" }, 502, undefined, model);

  return reply({ ...verdict, model }, 200, undefined, model);
}
