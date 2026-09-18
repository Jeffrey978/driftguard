// AI relevance-check helpers: payload, validation, cache, budget. Run with `npm test`.
import assert from "node:assert/strict";
import {
  aiCheckBlocker,
  aiStance,
  buildRelevanceBody,
  clampText,
  isValidAiEndpoint,
  lookupVerdict,
  parseRetryAfterMs,
  parseVerdict,
  recentDomainsFromEvents,
  resolveAiEndpoint,
  sanitizePageUrl,
  storeVerdict,
  verdictCacheKey
} from "../src/lib/ai.js";
import {
  AI_DWELL_MS,
  AI_ENDPOINT,
  AI_LIMITS,
  AI_MAX_CALLS_PER_SESSION,
  AI_MIN_INTERVAL_MS
} from "../src/lib/config.js";

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push({ name, error });
  }
}

const NOW = new Date(2026, 8, 18, 15, 0, 0).getTime();
const JPEG = "data:image/jpeg;base64,";

// --- parseVerdict -------------------------------------------------------------

await test("parseVerdict accepts a valid body", () => {
  assert.deepEqual(parseVerdict({ related: false, confidence: 0.82, reason: "Gaming news" }), {
    related: false,
    confidence: 0.82,
    reason: "Gaming news"
  });
});
await test("parseVerdict clamps confidence and reason", () => {
  const verdict = parseVerdict({ related: true, confidence: 4, reason: "x".repeat(500) });
  assert.equal(verdict.confidence, 1);
  assert.equal(verdict.reason.length, AI_LIMITS.reason);
  assert.equal(parseVerdict({ related: true, confidence: -2 }).confidence, 0);
  assert.equal(parseVerdict({ related: true, confidence: 0.9 }).reason, "");
});
await test("parseVerdict rejects malformed bodies", () => {
  assert.equal(parseVerdict(null), null);
  assert.equal(parseVerdict("ok"), null);
  assert.equal(parseVerdict({ related: "true", confidence: 0.9 }), null);
  assert.equal(parseVerdict({ related: true }), null);
  assert.equal(parseVerdict({ related: true, confidence: "high" }), null);
  assert.equal(parseVerdict({ error: "rate_limited", retryAfter: 30 }), null);
});
await test("aiStance is the scoring stance", () => {
  assert.equal(aiStance({ related: true, confidence: 0.7 }), "on_task");
  assert.equal(aiStance({ related: false, confidence: 0.3 }), null);
});

// --- URLs and endpoints -----------------------------------------------------------

await test("sanitizePageUrl strips the hash and tracking params", () => {
  assert.equal(
    sanitizePageUrl("https://example.com/a?utm_source=x&id=7&fbclid=abc&gclid=1#section"),
    "https://example.com/a?id=7"
  );
  assert.equal(sanitizePageUrl("not a url"), "");
  assert.ok(sanitizePageUrl(`https://example.com/?q=${"a".repeat(5000)}`).length <= AI_LIMITS.url);
});
await test("verdictCacheKey ignores the hash only", () => {
  assert.equal(verdictCacheKey("https://a.com/x?y=1#top"), "https://a.com/x?y=1");
  assert.equal(verdictCacheKey("garbage"), "");
});
await test("isValidAiEndpoint: https anywhere, http only on this machine", () => {
  assert.equal(isValidAiEndpoint("https://driftguard.example/api/relevance"), true);
  assert.equal(isValidAiEndpoint("http://localhost:3000/api/relevance"), true);
  assert.equal(isValidAiEndpoint("http://127.0.0.1:8787/api/relevance"), true);
  assert.equal(isValidAiEndpoint("http://[::1]:3000/x"), true);
  assert.equal(isValidAiEndpoint("http://example.com/api/relevance"), false);
  assert.equal(isValidAiEndpoint("ftp://example.com"), false);
  assert.equal(isValidAiEndpoint(""), false);
});
await test("resolveAiEndpoint falls back to the built-in endpoint", () => {
  assert.equal(resolveAiEndpoint({}), AI_ENDPOINT);
  assert.equal(resolveAiEndpoint({ aiEndpointOverride: "http://evil.example/x" }), AI_ENDPOINT);
  assert.equal(resolveAiEndpoint({ aiEndpointOverride: " http://localhost:3000/r " }), "http://localhost:3000/r");
});

// --- request body -------------------------------------------------------------------

await test("buildRelevanceBody clamps every field", () => {
  const body = buildRelevanceBody({
    intention: "  Write   the launch post ".padEnd(400, "!"),
    page: {
      url: "https://example.com/p?utm_medium=a#x",
      title: "T".repeat(900),
      description: "D".repeat(900),
      headings: Array.from({ length: 40 }, (_, i) => `H${i} ${"h".repeat(300)}`),
      text: "word ".repeat(3000)
    },
    context: {
      workTitle: "W".repeat(900),
      workDomain: "docs.google.com",
      recentDomains: ["a.com", "b.com", "c.com", "d.com", "e.com", "f.com", "g.com"]
    },
    screenshot: `${JPEG}AAAA`
  });
  assert.equal(body.intention.length, AI_LIMITS.intention);
  assert.ok(body.intention.startsWith("Write the launch post"));
  assert.equal(body.page.url, "https://example.com/p");
  assert.equal(body.page.title.length, AI_LIMITS.title);
  assert.equal(body.page.description.length, AI_LIMITS.description);
  assert.equal(body.page.headings.length, AI_LIMITS.headings);
  assert.ok(body.page.headings.every((h) => h.length <= AI_LIMITS.heading));
  assert.ok(body.page.text.length <= AI_LIMITS.text);
  assert.equal(body.context.workTitle.length, AI_LIMITS.title);
  assert.equal(body.context.recentDomains.length, 5);
  assert.equal(body.screenshot, `${JPEG}AAAA`);
});
await test("buildRelevanceBody omits empty optional fields", () => {
  const body = buildRelevanceBody({ intention: "Fix a bug", page: { url: "https://a.com/", title: "" } });
  assert.deepEqual(Object.keys(body).sort(), ["intention", "page"]);
  assert.deepEqual(Object.keys(body.page).sort(), ["title", "url"]);
  const withEmptyContext = buildRelevanceBody({
    intention: "x",
    page: { url: "https://a.com/" },
    context: { workTitle: "", recentDomains: [] }
  });
  assert.equal("context" in withEmptyContext, false);
});
await test("buildRelevanceBody drops a bad or oversized screenshot", () => {
  const page = { url: "https://a.com/", title: "A" };
  assert.equal("screenshot" in buildRelevanceBody({ intention: "x", page, screenshot: "data:image/png;base64,AAAA" }), false);
  assert.equal("screenshot" in buildRelevanceBody({ intention: "x", page, screenshot: 42 }), false);
  const big = JPEG + "A".repeat(AI_LIMITS.screenshotChars);
  assert.equal("screenshot" in buildRelevanceBody({ intention: "x", page, screenshot: big }), false);
});

await test("clampText collapses whitespace", () => {
  assert.equal(clampText("  a \n\t b  ", 10), "a b");
  assert.equal(clampText(null, 5), "");
});

// --- verdict cache -------------------------------------------------------------------

await test("storeVerdict keeps only the newest entries", () => {
  let cache = {};
  for (let i = 0; i < 5; i += 1) {
    cache = storeVerdict(cache, `https://a.com/${i}`, { related: true, confidence: 0.9, reason: "" }, NOW + i, 3);
  }
  assert.deepEqual(Object.keys(cache).sort(), ["https://a.com/2", "https://a.com/3", "https://a.com/4"]);
});
await test("lookupVerdict ignores the hash", () => {
  const cache = storeVerdict({}, "https://a.com/x#one", { related: false, confidence: 0.8, reason: "Nope" }, NOW);
  assert.equal(lookupVerdict(cache, "https://a.com/x#two").reason, "Nope");
  assert.equal(lookupVerdict(cache, "https://a.com/y"), null);
  assert.equal(lookupVerdict(undefined, "https://a.com/x"), null);
});
await test("storeVerdict does not mutate the old cache", () => {
  const before = {};
  storeVerdict(before, "https://a.com/", { related: true, confidence: 1 }, NOW);
  assert.deepEqual(before, {});
});

// --- retry-after, context ------------------------------------------------------------

await test("parseRetryAfterMs reads the body, then the header, then the default", () => {
  assert.equal(parseRetryAfterMs({ retryAfter: 30 }, "90"), 30000);
  assert.equal(parseRetryAfterMs({}, "90"), 90000);
  assert.equal(parseRetryAfterMs(null, null), 60000);
  assert.equal(parseRetryAfterMs({ retryAfter: 1 }), 5000);
  assert.equal(parseRetryAfterMs({ retryAfter: 999999 }), 3600000);
});
await test("recentDomainsFromEvents: distinct, newest first, this session only", () => {
  const events = [
    { sessionId: "s1", domain: "a.com", endedAt: 1 },
    { sessionId: "s1", domain: "b.com", endedAt: 3 },
    { sessionId: "s2", domain: "z.com", endedAt: 9 },
    { sessionId: "s1", domain: "a.com", endedAt: 4 },
    { sessionId: "s1", domain: "c.com", endedAt: 2 }
  ];
  assert.deepEqual(recentDomainsFromEvents(events, "s1"), ["a.com", "b.com", "c.com"]);
  assert.deepEqual(recentDomainsFromEvents(events, "s1", 2), ["a.com", "b.com"]);
});

// --- aiCheckBlocker -------------------------------------------------------------------

function blocker({ settings = {}, session = {}, observation = {}, now = NOW } = {}) {
  return aiCheckBlocker({
    settings: { aiCheck: true, excludedDomains: [], ...settings },
    session: session === null ? null : { id: "s1", status: "active", allowedDomains: [], aiCalls: 0, ...session },
    observation:
      observation === null
        ? null
        : {
            sessionId: "s1",
            url: "https://reddit.com/r/x",
            domain: "reddit.com",
            startedAt: NOW - AI_DWELL_MS - 1,
            ...observation
          },
    now
  });
}

await test("blocker: allowed when everything lines up", () => {
  assert.equal(blocker(), null);
});
await test("blocker: off, no session, paused, break", () => {
  assert.equal(blocker({ settings: { aiCheck: false } }).reason, "off");
  assert.equal(blocker({ session: null }).reason, "no_session");
  assert.equal(blocker({ session: { status: "paused" } }).reason, "no_session");
  assert.equal(blocker({ session: { breakUntil: NOW + 1000 } }).reason, "break");
});
await test("blocker: other session's observation or untrackable page", () => {
  assert.equal(blocker({ observation: { sessionId: "old" } }).reason, "no_observation");
  assert.equal(blocker({ observation: { url: "chrome://settings", domain: "" } }).reason, "untrackable");
});
await test("blocker: excluded and trusted domains are never sent", () => {
  assert.equal(blocker({ settings: { excludedDomains: ["reddit.com"] } }).reason, "excluded");
  assert.equal(blocker({ session: { allowedDomains: ["reddit.com"] } }).reason, "trusted");
});
await test("blocker: cached URL (ignoring the hash) is not re-sent", () => {
  const aiVerdicts = storeVerdict({}, "https://reddit.com/r/x", { related: false, confidence: 0.9 }, NOW);
  assert.equal(blocker({ session: { aiVerdicts }, observation: { url: "https://reddit.com/r/x#c" } }).reason, "cached");
});
await test("blocker: failed and in-flight observations", () => {
  assert.equal(blocker({ observation: { aiStatus: "failed" } }).reason, "failed");
  assert.equal(blocker({ observation: { aiStatus: "pending", aiPendingAt: NOW - 1000 } }).reason, "pending");
  assert.equal(blocker({ observation: { aiStatus: "pending", aiPendingAt: NOW - 60000 } }), null);
});
await test("blocker: per-session budget", () => {
  assert.equal(blocker({ session: { aiCalls: AI_MAX_CALLS_PER_SESSION } }).reason, "budget");
  assert.equal(blocker({ session: { aiCalls: AI_MAX_CALLS_PER_SESSION - 1 } }), null);
});
await test("blocker: waits out the dwell", () => {
  const result = blocker({ observation: { startedAt: NOW - 2000 } });
  assert.equal(result.reason, "dwell");
  assert.equal(result.retryInMs, AI_DWELL_MS - 2000);
});
await test("blocker: waits out a 429/503 backoff", () => {
  const result = blocker({ session: { aiBackoffUntil: NOW + 30000 } });
  assert.deepEqual(result, { reason: "backoff", retryInMs: 30000 });
});
await test("blocker: at most one call per interval", () => {
  const result = blocker({ session: { aiLastCallAt: NOW - 4000 } });
  assert.deepEqual(result, { reason: "interval", retryInMs: AI_MIN_INTERVAL_MS - 4000 });
  assert.equal(blocker({ session: { aiLastCallAt: NOW - AI_MIN_INTERVAL_MS } }), null);
});

for (const { name, error } of failures) {
  console.error(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`);
}
console.log(`ai: ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
