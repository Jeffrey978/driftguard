// Pure helpers for the opt-in AI relevance check. No chrome.* here, so node
// tests can import this file. The network and capture code lives in
// background.js; everything that decides *whether* and *what* to send is here.
import {
  AI_DEFAULT_RETRY_AFTER_S,
  AI_DWELL_MS,
  AI_ENDPOINT,
  AI_LIMITS,
  AI_MAX_CALLS_PER_SESSION,
  AI_MIN_INTERVAL_MS,
  AI_VERDICT_CACHE_LIMIT
} from "./config.js";
import { extractDomain, isAllowedDomain, isExcludedDomain, isTrackableUrl } from "./domains.js";

const TRACKING_PARAMS = /^(utm_[a-z_]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|ref_src|yclid)$/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function clampText(value, max) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// The verdict cache key: the URL without its #fragment.
export function verdictCacheKey(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

// The URL we send: no fragment, no common tracking parameters.
export function sanitizePageUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString().slice(0, AI_LIMITS.url);
  } catch {
    return "";
  }
}

// http(s) only, and plain http only for this machine, so page screenshots
// never cross a network unencrypted.
export function isValidAiEndpoint(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol === "https:") return true;
    return parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function resolveAiEndpoint(settings) {
  const override = String(settings?.aiEndpointOverride || "").trim();
  return override && isValidAiEndpoint(override) ? override : AI_ENDPOINT;
}

// Validates a 200 body. Anything malformed is treated as "no verdict".
export function parseVerdict(body) {
  if (!body || typeof body !== "object") return null;
  if (typeof body.related !== "boolean") return null;
  const confidence = Number(body.confidence);
  if (!Number.isFinite(confidence)) return null;
  return {
    related: body.related,
    confidence: Math.min(1, Math.max(0, confidence)),
    reason: clampText(typeof body.reason === "string" ? body.reason : "", AI_LIMITS.reason)
  };
}

// "on_task", "off_task", or null when the model wasn't sure enough to matter.
export { verdictStance as aiStance } from "./drift.js";

export function lookupVerdict(cache, url) {
  const key = verdictCacheKey(url);
  return key && cache && typeof cache === "object" ? cache[key] || null : null;
}

// Adds a verdict and keeps only the newest `limit` entries.
export function storeVerdict(cache, url, verdict, now = Date.now(), limit = AI_VERDICT_CACHE_LIMIT) {
  const key = verdictCacheKey(url);
  const next = { ...(cache || {}) };
  if (!key || !verdict) return next;
  next[key] = {
    related: Boolean(verdict.related),
    confidence: Number(verdict.confidence) || 0,
    reason: clampText(verdict.reason, AI_LIMITS.reason),
    at: now
  };
  const keys = Object.keys(next);
  if (keys.length <= limit) return next;
  keys
    .sort((a, b) => (next[a].at || 0) - (next[b].at || 0))
    .slice(0, keys.length - limit)
    .forEach((old) => delete next[old]);
  return next;
}

// Up to `limit` distinct domains from this session's visits, newest first.
export function recentDomainsFromEvents(events, sessionId, limit = AI_LIMITS.recentDomains) {
  const seen = [];
  const list = (events || [])
    .filter((event) => event.sessionId === sessionId && event.domain)
    .sort((a, b) => (b.endedAt || b.timestamp || 0) - (a.endedAt || a.timestamp || 0));
  for (const event of list) {
    if (!seen.includes(event.domain)) seen.push(event.domain);
    if (seen.length >= limit) break;
  }
  return seen;
}

// The exact contract body, with every field clamped to its limit.
export function buildRelevanceBody({ intention, page, context, screenshot }) {
  const body = {
    intention: clampText(intention, AI_LIMITS.intention),
    page: {
      url: sanitizePageUrl(page?.url),
      title: clampText(page?.title, AI_LIMITS.title)
    }
  };

  const description = clampText(page?.description, AI_LIMITS.description);
  if (description) body.page.description = description;

  const headings = (Array.isArray(page?.headings) ? page.headings : [])
    .map((heading) => clampText(heading, AI_LIMITS.heading))
    .filter(Boolean)
    .slice(0, AI_LIMITS.headings);
  if (headings.length) body.page.headings = headings;

  const text = clampText(page?.text, AI_LIMITS.text);
  if (text) body.page.text = text;

  if (context) {
    const ctx = {};
    const workTitle = clampText(context.workTitle, AI_LIMITS.title);
    const workDomain = clampText(context.workDomain, 253);
    const recentDomains = (context.recentDomains || [])
      .map((domain) => clampText(domain, 253))
      .filter(Boolean)
      .slice(0, AI_LIMITS.recentDomains);
    if (workTitle) ctx.workTitle = workTitle;
    if (workDomain) ctx.workDomain = workDomain;
    if (recentDomains.length) ctx.recentDomains = recentDomains;
    if (Object.keys(ctx).length) body.context = ctx;
  }

  if (
    typeof screenshot === "string" &&
    screenshot.startsWith("data:image/jpeg;base64,") &&
    screenshot.length <= AI_LIMITS.screenshotChars
  ) {
    body.screenshot = screenshot;
  }

  return body;
}

// Seconds from a 429 body ({ retryAfter }) or Retry-After header, as ms.
export function parseRetryAfterMs(body, header) {
  const fromBody = Number(body?.retryAfter);
  const fromHeader = Number(header);
  const seconds = Number.isFinite(fromBody) && fromBody > 0
    ? fromBody
    : Number.isFinite(fromHeader) && fromHeader > 0
      ? fromHeader
      : AI_DEFAULT_RETRY_AFTER_S;
  return Math.min(3600, Math.max(5, seconds)) * 1000;
}

// Why this observation must not be sent right now, or null if it may be.
// Returns { reason, retryInMs? }: retryInMs means "not yet, try again then".
export function aiCheckBlocker({ settings, session, observation, now = Date.now() }) {
  if (!settings?.aiCheck) return { reason: "off" };
  if (!session || session.status !== "active") return { reason: "no_session" };
  if (session.breakUntil && session.breakUntil > now) return { reason: "break" };
  if (!observation || observation.sessionId !== session.id) return { reason: "no_observation" };
  if (!observation.url || !isTrackableUrl(observation.url)) return { reason: "untrackable" };

  const domain = observation.domain || extractDomain(observation.url);
  if (!domain || isExcludedDomain(domain, settings.excludedDomains)) return { reason: "excluded" };
  if (isAllowedDomain(domain, session.allowedDomains)) return { reason: "trusted" };
  if (lookupVerdict(session.aiVerdicts, observation.url)) return { reason: "cached" };
  if (observation.aiStatus === "failed") return { reason: "failed" };
  if (observation.aiStatus === "pending" && now - (observation.aiPendingAt || 0) < 30000) {
    return { reason: "pending" };
  }
  if ((session.aiCalls || 0) >= AI_MAX_CALLS_PER_SESSION) return { reason: "budget" };

  const dwellLeft = observation.startedAt + AI_DWELL_MS - now;
  if (dwellLeft > 0) return { reason: "dwell", retryInMs: dwellLeft };

  if (session.aiBackoffUntil && session.aiBackoffUntil > now) {
    return { reason: "backoff", retryInMs: session.aiBackoffUntil - now };
  }

  const gap = session.aiLastCallAt ? now - session.aiLastCallAt : Infinity;
  if (gap < AI_MIN_INTERVAL_MS) return { reason: "interval", retryInMs: AI_MIN_INTERVAL_MS - gap };

  return null;
}
