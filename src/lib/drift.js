// Pure drift scoring. No chrome.* here, so node tests can import this file.
import { getDomainCategory, isAllowedDomain, isExcludedDomain } from "./domains.js";
import { AI_CONFIDENCE_MIN, AI_OFF_TASK_BOOST, LOCK_AFTER_PROMPTS } from "./config.js";

export const SENSITIVITY_THRESHOLDS = {
  calm: 72,
  balanced: 58,
  strict: 44
};

// Drift time that earns a first check-in on any sensitivity, counted over a window.
const DRIFT_CHECKIN_SECONDS = 5 * 60;
const DRIFT_WINDOW_SECONDS = 10 * 60;

export const DRIFT_REMINDER_INTERVAL_MINUTES = {
  calm: 4,
  balanced: 2,
  strict: 1
};

const INTENTION_KEYWORDS = {
  writing: ["write", "draft", "essay", "copy", "newsletter", "article", "blog", "memo", "proposal", "script"],
  coding: ["code", "debug", "build", "fix", "deploy", "ship", "implement", "refactor", "test", "bug", "auth"],
  study: ["study", "course", "coursera", "lecture", "lesson", "homework", "assignment", "exam", "class"],
  research: ["research", "learn", "compare", "read", "investigate", "market", "pricing", "analyze"],
  design: ["design", "mockup", "wireframe", "figma", "brand", "layout", "prototype"],
  communication: ["email", "reply", "inbox", "slack", "message", "follow up", "outreach"]
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "i", "in", "into",
  "is", "it", "of", "on", "or", "the", "this", "to", "with"
]);

export function classifyIntention(intention) {
  const normalized = String(intention || "").toLowerCase();

  for (const [type, keywords] of Object.entries(INTENTION_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return type;
  }

  return "general";
}

export function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function titleOverlapCount(intention, title) {
  const intentionTokens = tokenize(intention);
  const titleTokens = new Set(tokenize(title));

  if (!intentionTokens.length || !titleTokens.size) return 0;
  return intentionTokens.filter((token) => titleTokens.has(token)).length;
}

export function hasLowTitleOverlap(intention, title) {
  const intentionTokens = tokenize(intention);
  const titleTokens = tokenize(title);

  if (!intentionTokens.length || !titleTokens.length) return false;

  const titleSet = new Set(titleTokens);
  return intentionTokens.every((token) => !titleSet.has(token));
}

export function getDriftReminderIntervalMs(session) {
  const minutes =
    DRIFT_REMINDER_INTERVAL_MINUTES[session?.sensitivity] ?? DRIFT_REMINDER_INTERVAL_MINUTES.balanced;
  return minutes * 60 * 1000;
}

// "on_task" / "off_task" when the AI verdict is confident enough to count,
// otherwise null (the rules decide). Kept here, not in ai.js, so the scoring
// module has no dependency on the network helpers.
export function verdictStance(verdict) {
  if (!verdict || typeof verdict.related !== "boolean") return null;
  if (!(Number(verdict.confidence) >= AI_CONFIDENCE_MIN)) return null;
  return verdict.related ? "on_task" : "off_task";
}

// aiVerdict is optional ({ related, confidence, reason }). Returns the rule
// score adjusted by a confident verdict, plus `ai` ("on_task" | "off_task" |
// null) and `aiReason` so callers can show where the reason came from.
export function computeDriftScore({ session, observation, settings, events, now, aiVerdict = null }) {
  const result = computeRuleScore({ session, observation, settings, events, now });
  const trusted =
    isExcludedDomain(observation.domain, settings.excludedDomains) ||
    isAllowedDomain(observation.domain, session.allowedDomains);
  const ai = trusted ? null : verdictStance(aiVerdict);

  if (ai === "on_task") {
    return { ...result, score: 0, ai, aiReason: "", reasons: ["AI: this page fits your task", ...result.reasons] };
  }

  if (ai === "off_task") {
    const aiReason = String(aiVerdict.reason || "").trim() || "Doesn't look related to your task";
    return {
      ...result,
      score: Math.max(0, Math.min(100, result.score + AI_OFF_TASK_BOOST)),
      ai,
      aiReason,
      reasons: [aiReason, ...result.reasons]
    };
  }

  return { ...result, ai: null, aiReason: "" };
}

// The one reason shown on the prompt. Sustained-behaviour reasons read better
// than the category label, so they win over the first rule reason.
export function pickReason(reasons) {
  const list = Array.isArray(reasons) ? reasons : [];
  const preferred = list.find((reason) => /minute|again|switching|several/i.test(reason));
  return preferred || list[0] || "";
}

// Like pickReason, but a confident off-task AI verdict always leads.
export function pickPromptReason(scored) {
  if (scored?.ai === "off_task" && scored.aiReason) return { reason: scored.aiReason, source: "ai" };
  return { reason: pickReason(scored?.reasons), source: "rules" };
}

// Whether this page can become the "Back to work" target.
export function isAlignedSurface(observation, session, category, ai = null) {
  if (isAllowedDomain(observation.domain, session.allowedDomains)) return true;
  if (ai === "on_task") return true;
  if (ai === "off_task") return false;

  // Work and research domains are real signals; "unknown" never is.
  if (category === "work") return true;
  if (category === "research" && ["research", "coding", "study"].includes(session.intentionType)) return true;

  return false;
}

// Card in the corner, or the centre-screen lock. The lock is for repeat drift:
// after a break has already been taken, or on the third prompt of one drift.
export function decidePromptMode({ breaksTaken = 0, promptCount = 0 } = {}) {
  if ((Number(breaksTaken) || 0) > 0) return "lock";
  if ((Number(promptCount) || 0) >= LOCK_AFTER_PROMPTS) return "lock";
  return "card";
}

// A break that ends on a distraction goes straight to the lock; the friendly
// "Break's over" card is for people already back on the work. Unknown pages
// get the card: they score low on the rules for being unknown, not for being fine.
export function shouldLockAfterBreak({ url, domain, session, category, ai = null }) {
  if (isAlignedSurface({ domain }, session, category, ai)) return false;
  if (url && url === session.lastAlignedUrl) return false;
  if (ai === "off_task") return true;
  return category === "distracting" || category === "ambiguous";
}

function computeRuleScore({ session, observation, settings, events, now }) {
  const reasons = [];
  let score = 0;
  const durationSeconds = Math.max(
    0,
    Math.round((now - (observation.domainSince || observation.startedAt)) / 1000)
  );
  const category = getDomainCategory(observation.domain, session);

  if (isExcludedDomain(observation.domain, settings.excludedDomains)) {
    return { score: 0, category, reasons: ["Domain is excluded"] };
  }

  if (category === "distracting") {
    score += 40;
    reasons.push("Known distracting site");
    if (durationSeconds > 60) {
      score += 20;
      reasons.push("Stayed longer than a minute");
    }
  }

  // Sustained time on anything that is not the work keeps escalating, so a
  // ten-minute sit is never scored the same as a two-minute one.
  if (["ambiguous", "distracting", "unknown"].includes(category)) {
    if (durationSeconds > 300) {
      score += 12;
      reasons.push("Over five minutes here");
    }
    if (durationSeconds > 600) {
      score += 12;
      reasons.push("Over ten minutes here");
    }
  }

  if (category === "ambiguous") {
    score += session.intentionType === "research" ? 8 : 32;
    reasons.push("Could be work, could be a rabbit hole");
    if (durationSeconds > 60) {
      score += session.intentionType === "research" ? 14 : 26;
      reasons.push("On it for more than a minute");
    }
  }

  if (category === "communication" && session.intentionType !== "communication") {
    score += 14;
    reasons.push("Inbox or chat outside a communication session");
  }

  if (category === "unknown") {
    score += session.intentionType === "research" ? 4 : 16;
    reasons.push("Site we don't recognise");

    if (durationSeconds > 45) {
      score += session.intentionType === "research" ? 8 : 24;
      reasons.push("Here for more than 45 seconds");
    }

    if (durationSeconds > 120) {
      score += session.intentionType === "research" ? 8 : 16;
      reasons.push("Here for more than 2 minutes");
    }
  }

  if (category === "research" && !["research", "coding", "study"].includes(session.intentionType)) {
    score += 6;
    reasons.push("Research outside a research session");
  }

  if (
    ["ambiguous", "distracting", "unknown"].includes(category) &&
    hasLowTitleOverlap(session.intention, observation.title)
  ) {
    score += 10;
    reasons.push("Page title doesn't mention your task");
  }

  // A tab title that echoes the intention is the strongest evidence that an
  // ambiguous site is being used for real work. Without this, an on-topic
  // tutorial on YouTube scores the same as an off-topic one.
  if (["ambiguous", "unknown"].includes(category)) {
    const overlap = titleOverlapCount(session.intention, observation.title);
    if (overlap >= 2) {
      score -= 30;
      reasons.push("Page title closely matches your task");
    } else if (overlap === 1) {
      score -= 16;
      reasons.push("Page title partly matches your task");
    }
  }

  const recentEvents = (events || []).filter(
    (event) => event.sessionId === session.id && now - event.endedAt <= 5 * 60 * 1000
  );
  const recentDomains = new Set(recentEvents.map((event) => event.domain));

  if (recentEvents.length >= 5) {
    score += 14;
    reasons.push("Lots of tab switching in the last 5 minutes");
  }

  if (recentDomains.size >= 4) {
    score += 12;
    reasons.push("Several sites visited recently");
  }

  const repeatedDistractor = recentEvents.filter((event) => event.domain === observation.domain).length >= 2;
  if (repeatedDistractor && ["ambiguous", "distracting"].includes(category)) {
    score += 10;
    reasons.push("Back on the same site again");
  }

  // Safety net: about five minutes on distractions in the last ten, however it
  // was split up (autoplay, hopping between sites, stepping away mid-video),
  // is enough for a first check-in. An on-topic page title still protects.
  if (
    ["ambiguous", "distracting"].includes(category) &&
    titleOverlapCount(session.intention, observation.title) < 2
  ) {
    const driftSeconds =
      durationSeconds +
      (events || [])
        .filter(
          (event) =>
            event.sessionId === session.id &&
            now - event.endedAt <= DRIFT_WINDOW_SECONDS * 1000 &&
            event.endedAt <= (observation.domainSince || observation.startedAt) &&
            ["ambiguous", "distracting"].includes(event.category) &&
            event.ai !== "on_task" &&
            !isAllowedDomain(event.domain, session.allowedDomains)
        )
        .reduce((sum, event) => sum + (Number(event.durationSeconds) || 0), 0);
    if (driftSeconds >= DRIFT_CHECKIN_SECONDS) {
      const threshold = SENSITIVITY_THRESHOLDS[session.sensitivity] ?? SENSITIVITY_THRESHOLDS.balanced;
      score = Math.max(score + 30, threshold);
      reasons.push("About five minutes off task");
    }
  }

  if (category === "work") score -= 24;

  if (category === "research" && ["research", "coding", "study"].includes(session.intentionType)) {
    score -= 16;
  }

  if (isAllowedDomain(observation.domain, session.allowedDomains)) score -= 30;

  score = Math.max(0, Math.min(100, score));
  return { score, category, reasons };
}
