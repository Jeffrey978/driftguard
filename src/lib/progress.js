// Pure progress / timing helpers shared by the service worker, popup and recap.
// No chrome.* here, so node tests can import this file.

export const DEFAULT_DAILY_GOAL_MINUTES = 120;
export const STREAK_MIN_FOCUS_SECONDS = 10 * 60;
export const XP_COMPLETION_BONUS = 25;
export const XP_PER_GOOD_RESPONSE = 5;
export const XP_PROMPT_BONUS_CAP = 50;
export const GOOD_RESPONSES = ["refocus", "save_later", "break_5", "break_10"];

const DAY_MS = 24 * 60 * 60 * 1000;

// Local calendar day, e.g. "2026-09-18".
export function dayKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Step back one local calendar day. Uses noon so DST shifts never skip a day.
export function previousDayKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  const noon = new Date(y, m - 1, d, 12, 0, 0);
  return dayKey(noon.getTime() - DAY_MS);
}

export function lastNDayKeys(n, now = Date.now()) {
  const keys = [dayKey(now)];
  while (keys.length < n) keys.unshift(previousDayKey(keys[0]));
  return keys;
}

// Consecutive qualifying days ending today. If today has not qualified yet the
// streak is still alive from yesterday, so we count back from yesterday.
export function computeStreak(daily, now = Date.now()) {
  const qualifies = (key) => Boolean(daily?.[key]?.qualified);
  let key = dayKey(now);
  if (!qualifies(key)) key = previousDayKey(key);

  let streak = 0;
  while (qualifies(key)) {
    streak += 1;
    key = previousDayKey(key);
  }
  return streak;
}

// Level n -> n+1 costs 60 * n XP, so the cumulative XP to reach level n is
// 30 * n * (n - 1): L2 at 60, L3 at 180, L4 at 360, L5 at 600 ...
export function xpForLevel(level) {
  return 30 * level * (level - 1);
}

export function levelInfo(xp) {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (xpForLevel(level + 1) <= total) level += 1;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    xp: total,
    into: total - floor,
    needed: next - floor,
    progress: (total - floor) / (next - floor)
  };
}

// Wall-clock time the session has been running, minus paused time. Breaks
// count: a break is part of a focus block, a pause is not.
export function sessionElapsedMs(session, now = Date.now()) {
  if (!session) return 0;
  const end = session.endedAt || now;
  const pausedOpen = session.pausedAt ? end - session.pausedAt : 0;
  return Math.max(0, end - session.startedAt - (session.pausedTotalMs || 0) - pausedOpen);
}

export function sessionRemainingMs(session, now = Date.now()) {
  if (!session?.durationMinutes) return null;
  return Math.max(0, session.durationMinutes * 60000 - sessionElapsedMs(session, now));
}

export function isAlignedCategory(category) {
  return category === "work" || category === "research" || category === "communication";
}

// A visit counts as focused when its site is aligned, or when a confident AI
// verdict said this page was on task.
export function isAlignedEvent(event) {
  return isAlignedCategory(event?.category) || event?.ai === "on_task";
}

export function focusedSecondsFromEvents(events) {
  return (events || []).reduce(
    (sum, event) => (isAlignedEvent(event) ? sum + (event.durationSeconds || 0) : sum),
    0
  );
}

export function computeSessionXp({ focusedSeconds, completed, goodResponses }) {
  const focus = Math.floor((focusedSeconds || 0) / 60);
  const completion = completed ? XP_COMPLETION_BONUS : 0;
  const prompts = Math.min(XP_PROMPT_BONUS_CAP, (goodResponses || 0) * XP_PER_GOOD_RESPONSE);
  return { focus, completion, prompts, total: focus + completion + prompts };
}

// Last N unique intentions, newest first.
export function recentIntentions(sessions, limit = 5) {
  const seen = new Set();
  const result = [];
  for (const session of sessions || []) {
    const text = String(session?.intention || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

// Drop day buckets older than `keepDays` so storage stays small.
export function pruneDaily(daily, keepDays = 120, now = Date.now()) {
  const keep = new Set(lastNDayKeys(keepDays, now));
  return Object.fromEntries(Object.entries(daily || {}).filter(([key]) => keep.has(key)));
}
