// Drift scoring with and without an AI verdict, and prompt mode. Run with `npm test`.
import assert from "node:assert/strict";
import {
  computeDriftScore,
  decidePromptMode,
  isAlignedSurface,
  pickPromptReason,
  pickReason,
  SENSITIVITY_THRESHOLDS,
  shouldLockAfterBreak,
  verdictStance
} from "../src/lib/drift.js";
import { isAlignedEvent } from "../src/lib/progress.js";
import { AI_OFF_TASK_BOOST } from "../src/lib/config.js";

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
const THRESHOLD = SENSITIVITY_THRESHOLDS.balanced;

function session(overrides = {}) {
  return {
    id: "s1",
    intention: "Write the launch post",
    intentionType: "writing",
    sensitivity: "balanced",
    allowedDomains: [],
    ...overrides
  };
}

function observation(domain, seconds, title = "Something unrelated") {
  return { sessionId: "s1", tabId: 1, url: `https://${domain}/page`, domain, title, startedAt: NOW - seconds * 1000 };
}

const settings = { excludedDomains: [] };

function score(domain, seconds, aiVerdict, overrides = {}) {
  return computeDriftScore({
    session: session(overrides.session),
    observation: observation(domain, seconds, overrides.title),
    settings: overrides.settings || settings,
    events: [],
    now: NOW,
    aiVerdict
  });
}

// --- verdictStance ---------------------------------------------------------

await test("verdictStance: confident related is on_task", () => {
  assert.equal(verdictStance({ related: true, confidence: 0.9 }), "on_task");
});
await test("verdictStance: confident unrelated is off_task", () => {
  assert.equal(verdictStance({ related: false, confidence: 0.7 }), "off_task");
});
await test("verdictStance: low confidence or missing is null", () => {
  assert.equal(verdictStance({ related: false, confidence: 0.69 }), null);
  assert.equal(verdictStance({ related: true, confidence: "nope" }), null);
  assert.equal(verdictStance({ related: "yes", confidence: 1 }), null);
  assert.equal(verdictStance(null), null);
});

// --- computeDriftScore -----------------------------------------------------

await test("no verdict: rules only, ai is null", () => {
  const result = score("reddit.com", 120, null);
  assert.equal(result.ai, null);
  assert.equal(result.aiReason, "");
  assert.ok(result.score >= THRESHOLD, `rules alone should flag a long reddit visit (${result.score})`);
});

await test("on_task verdict drops the score below the threshold", () => {
  const rules = score("reddit.com", 600, null);
  const result = score("reddit.com", 600, { related: true, confidence: 0.92, reason: "Thread about launch posts" });
  assert.ok(rules.score >= THRESHOLD);
  assert.equal(result.score, 0);
  assert.ok(result.score < THRESHOLD);
  assert.equal(result.ai, "on_task");
  assert.equal(result.reasons[0], "AI: this page fits your task");
});

await test("off_task verdict adds the boost and leads with the AI reason", () => {
  const rules = score("example.org", 20, null);
  const result = score("example.org", 20, { related: false, confidence: 0.85, reason: "A recipe blog" });
  assert.equal(result.score, Math.min(100, rules.score + AI_OFF_TASK_BOOST));
  assert.equal(result.ai, "off_task");
  assert.equal(result.aiReason, "A recipe blog");
  assert.equal(result.reasons[0], "A recipe blog");
});

await test("off_task verdict on a work domain can still flag it", () => {
  const rules = score("github.com", 30, null);
  const result = score("github.com", 30, { related: false, confidence: 0.95, reason: "Browsing trending repos" });
  assert.equal(result.score, rules.score + AI_OFF_TASK_BOOST);
});

await test("off_task score is clamped to 100", () => {
  const result = score("reddit.com", 1200, { related: false, confidence: 1, reason: "Memes" });
  assert.ok(result.score <= 100);
});

await test("off_task without a reason gets a default reason", () => {
  const result = score("example.org", 20, { related: false, confidence: 0.9, reason: "   " });
  assert.equal(result.aiReason, "Doesn't look related to your task");
});

await test("low-confidence verdict: the rules decide", () => {
  const rules = score("reddit.com", 120, null);
  const unsureOff = score("reddit.com", 120, { related: false, confidence: 0.5, reason: "Maybe" });
  const unsureOn = score("reddit.com", 120, { related: true, confidence: 0.4, reason: "Maybe" });
  assert.equal(unsureOff.score, rules.score);
  assert.equal(unsureOn.score, rules.score);
  assert.equal(unsureOff.ai, null);
  assert.deepEqual(unsureOff.reasons, rules.reasons);
});

await test("trusted domain ignores the verdict", () => {
  const result = score("reddit.com", 120, { related: false, confidence: 0.99, reason: "Off" }, {
    session: { allowedDomains: ["reddit.com"] }
  });
  assert.equal(result.ai, null);
  assert.ok(result.score < THRESHOLD);
});

await test("excluded domain ignores the verdict", () => {
  const result = score("reddit.com", 120, { related: false, confidence: 0.99, reason: "Off" }, {
    settings: { excludedDomains: ["reddit.com"] }
  });
  assert.equal(result.ai, null);
  assert.equal(result.score, 0);
});

// --- reasons ----------------------------------------------------------------

await test("pickPromptReason: an off_task verdict's reason comes from the AI", () => {
  const result = score("reddit.com", 400, { related: false, confidence: 0.9, reason: "Unrelated gaming thread" });
  assert.deepEqual(pickPromptReason(result), { reason: "Unrelated gaming thread", source: "ai" });
});

await test("pickPromptReason: without a verdict the rules reason is used", () => {
  const result = score("reddit.com", 400, null);
  const picked = pickPromptReason(result);
  assert.equal(picked.source, "rules");
  assert.equal(picked.reason, pickReason(result.reasons));
  assert.ok(picked.reason.length > 0);
});

await test("pickReason prefers sustained-behaviour reasons", () => {
  assert.equal(pickReason(["Known distracting site", "Over five minutes here"]), "Over five minutes here");
  assert.equal(pickReason([]), "");
  assert.equal(pickReason(undefined), "");
});

// --- aligned surfaces ------------------------------------------------------

await test("isAlignedSurface: on_task makes any page a work surface", () => {
  assert.equal(isAlignedSurface(observation("reddit.com", 10), session(), "ambiguous", "on_task"), true);
});
await test("isAlignedSurface: off_task overrides a work category", () => {
  assert.equal(isAlignedSurface(observation("github.com", 10), session(), "work", "off_task"), false);
});
await test("isAlignedSurface: trusted beats off_task", () => {
  const s = session({ allowedDomains: ["reddit.com"] });
  assert.equal(isAlignedSurface(observation("reddit.com", 10), s, "work", "off_task"), true);
});
await test("isAlignedSurface: no verdict keeps the old rules", () => {
  assert.equal(isAlignedSurface(observation("github.com", 10), session(), "work"), true);
  assert.equal(isAlignedSurface(observation("example.org", 10), session(), "unknown"), false);
  assert.equal(isAlignedSurface(observation("stackoverflow.com", 10), session(), "research"), false);
  assert.equal(
    isAlignedSurface(observation("stackoverflow.com", 10), session({ intentionType: "coding" }), "research"),
    true
  );
});

await test("isAlignedEvent counts on_task visits as focus", () => {
  assert.equal(isAlignedEvent({ category: "ambiguous", ai: "on_task" }), true);
  assert.equal(isAlignedEvent({ category: "ambiguous" }), false);
  assert.equal(isAlignedEvent({ category: "work" }), true);
  assert.equal(isAlignedEvent(null), false);
});

// --- prompt mode -------------------------------------------------------------

await test("decidePromptMode: first prompts are corner cards", () => {
  assert.equal(decidePromptMode({ breaksTaken: 0, promptCount: 1 }), "card");
  assert.equal(decidePromptMode({ breaksTaken: 0, promptCount: 2 }), "card");
  assert.equal(decidePromptMode(), "card");
});
await test("decidePromptMode: third prompt of a drift locks", () => {
  assert.equal(decidePromptMode({ breaksTaken: 0, promptCount: 3 }), "lock");
  assert.equal(decidePromptMode({ breaksTaken: 0, promptCount: 7 }), "lock");
});
await test("decidePromptMode: any break taken locks from the first prompt", () => {
  assert.equal(decidePromptMode({ breaksTaken: 1, promptCount: 1 }), "lock");
});

const afterBreak = (domain, category, extra = {}) =>
  shouldLockAfterBreak({ url: `https://${domain}/x`, domain, category, session: session(), ...extra });

await test("shouldLockAfterBreak: break ending on a distraction locks", () => {
  assert.equal(afterBreak("www.youtube.com", "ambiguous"), true);
  assert.equal(afterBreak("instagram.com", "distracting"), true);
});
await test("shouldLockAfterBreak: back on the work gets the friendly card", () => {
  assert.equal(afterBreak("docs.google.com", "work"), false);
  assert.equal(
    afterBreak("www.youtube.com", "ambiguous", { session: session({ allowedDomains: ["youtube.com"] }) }),
    false
  );
  assert.equal(
    afterBreak("www.youtube.com", "ambiguous", { session: session({ lastAlignedUrl: "https://www.youtube.com/x" }) }),
    false
  );
});
await test("shouldLockAfterBreak: the AI verdict decides either way", () => {
  assert.equal(afterBreak("www.youtube.com", "ambiguous", { ai: "on_task" }), false);
  assert.equal(afterBreak("example.org", "unknown", { ai: "off_task" }), true);
});
await test("shouldLockAfterBreak: unknown pages without a verdict get the card", () => {
  assert.equal(afterBreak("example.org", "unknown"), false);
});

// --- timing: site time and the five-minute safety net ---------------------

const calm = session({ sensitivity: "calm", intention: "check website ui", intentionType: "research" });
const drift = (obs, events = [], sess = calm) =>
  computeDriftScore({ session: sess, observation: obs, settings, events, now: NOW });
const visit = (domain, endedMinsAgo, seconds, extra = {}) => ({
  sessionId: "s1", domain, category: "ambiguous", endedAt: NOW - endedMinsAgo * 60000, durationSeconds: seconds, ...extra
});

await test("site time survives a new URL on the same site (autoplay)", () => {
  const fresh = { ...observation("www.youtube.com", 5, "Next video"), domainSince: NOW - 400 * 1000 };
  const result = drift(fresh);
  assert.ok(result.reasons.includes("Over five minutes here"), result.reasons.join(" | "));
});
await test("five minutes of split-up drift in ten earns a check-in, even on calm", () => {
  const events = [visit("reddit.com", 8, 90), visit("www.youtube.com", 6, 120), visit("x.com", 2, 60)];
  const result = drift(observation("www.youtube.com", 40, "Random vlog"), events);
  assert.ok(result.reasons.includes("About five minutes off task"), result.reasons.join(" | "));
  assert.ok(result.score >= SENSITIVITY_THRESHOLDS.calm, `score ${result.score}`);
});
await test("safety net ignores old drift, on-task AI visits and trusted sites", () => {
  const events = [
    visit("reddit.com", 14, 200),
    visit("www.youtube.com", 5, 200, { ai: "on_task" }),
    visit("x.com", 3, 200)
  ];
  const trusted = session({ sensitivity: "calm", intention: "check website ui", allowedDomains: ["x.com"] });
  const result = drift(observation("www.youtube.com", 40, "Random vlog"), events, trusted);
  assert.ok(!result.reasons.includes("About five minutes off task"), result.reasons.join(" | "));
});
await test("safety net spares a page whose title matches the task", () => {
  const events = [visit("reddit.com", 6, 300)];
  const result = drift(observation("www.youtube.com", 40, "How to check website UI quickly"), events);
  assert.ok(!result.reasons.includes("About five minutes off task"), result.reasons.join(" | "));
});

for (const { name, error } of failures) {
  console.error(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`);
}
console.log(`drift: ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
