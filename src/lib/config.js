// Build-time configuration. No chrome.* here, so node tests can import it.
//
// AI_ENDPOINT is where the opt-in AI relevance check sends its request. Point
// it at your own deployment of the site's /api/relevance route (see AI_CHECK.md).
// For local development, leave this alone and set Settings → Advanced →
// "AI endpoint" to e.g. http://localhost:3000/api/relevance instead.
export const AI_ENDPOINT = "https://driftguard-murex.vercel.app/api/relevance";

// When to check: a page must hold the tab this long before it is sent.
export const AI_DWELL_MS = 6000;

// Budget (matches AI_CHECK.md): at most one call per 10 s, 150 per session.
export const AI_MIN_INTERVAL_MS = 10000;
export const AI_MAX_CALLS_PER_SESSION = 150;
export const AI_TIMEOUT_MS = 12000;

// A 503 means the server has no model key; don't ask again for a while.
export const AI_UNAVAILABLE_BACKOFF_MS = 10 * 60 * 1000;
export const AI_DEFAULT_RETRY_AFTER_S = 60;

// Verdicts below this confidence are ignored and the rules decide.
export const AI_CONFIDENCE_MIN = 0.7;
export const AI_OFF_TASK_BOOST = 35;

// Verdict cache per session (keyed by URL without the hash).
export const AI_VERDICT_CACHE_LIMIT = 200;

// Payload limits. The contract caps are the server's; the extension stays
// under them so a request is never rejected for size.
export const AI_LIMITS = {
  intention: 200,
  url: 2048,
  title: 300,
  description: 500,
  headings: 20,
  heading: 200,
  pageText: 3000,
  text: 4000,
  reason: 120,
  recentDomains: 5,
  screenshotChars: 700000,
  screenshotMaxWidth: 1024,
  captureQuality: 70,
  encodeQuality: 0.6
};

// Lock mode (the centre-screen prompt).
export const LOCK_AFTER_PROMPTS = 3;
export const LOCK_UNLOCK_SECONDS = 15;
