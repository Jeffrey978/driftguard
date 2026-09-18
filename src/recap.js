import { hydrateMascots, setMascotSlot } from "./mascot.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCORE_CIRCUMFERENCE = 2 * Math.PI * 60;
const SEEN_KEY_PREFIX = "driftguard.recapSeen.";
const CONFETTI_COLORS = ["#FF8A4C", "#E5552E", "#B8202A", "#E0A21B", "#1F9D6B", "#FFD9C7"];

const CATEGORY_LABELS = {
  work: "Work",
  research: "Research",
  communication: "Communication",
  ambiguous: "Could go either way",
  distracting: "Drift-prone",
  unknown: "Other"
};

const RESPONSES = {
  refocus: { label: "Back to work", note: "Returned to the task", tone: "var(--good)", icon: "arrow" },
  still_relevant: { label: "It's for work", note: "Site trusted for this session", tone: "var(--cat-research)", icon: "check" },
  save_later: { label: "Saved for later", note: "Parked the tab", tone: "var(--cat-communication)", icon: "bookmark" },
  break_5: { label: "5 minute break", note: "Rested on purpose", tone: "var(--warn)", icon: "cup" },
  break_10: { label: "10 minute break", note: "Rested on purpose", tone: "var(--warn)", icon: "cup" },
  dismiss: { label: "Dismissed", note: "Closed the check-in", tone: "var(--ink-3)", icon: "dash" },
  end_session: { label: "Ended session", note: "Called it from the lock screen", tone: "var(--ink-3)", icon: "stop" },
  shown: { label: "No answer", note: "Check-in went unanswered", tone: "var(--ink-3)", icon: "dash" },
  reminder_shown: { label: "Reminders", note: "Follow-up nudges", tone: "var(--crimson)", icon: "bell" },
  lock: { label: "Lock screens", note: "Centre-screen check-ins", tone: "var(--brand)", icon: "lock" }
};

const ICONS = {
  arrow: '<path d="M4 10h11M11 5.5 15.5 10 11 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  check: '<path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  bookmark: '<path d="M6 3.5h8a1 1 0 0 1 1 1v12l-5-3.2-5 3.2v-12a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  cup: '<path d="M4.5 8h9v4a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4zM13.5 9h1.2a2 2 0 0 1 0 4h-1.4M7 3.5v2M10 3.5v2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  dash: '<path d="M6 10h8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  stop: '<rect x="5.5" y="5.5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  lock: '<rect x="4.5" y="8.5" width="11" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 8.5V6.5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  bell: '<path d="M10 3.5a4.5 4.5 0 0 0-4.5 4.5v3L4 13.5h12L14.5 11V8A4.5 4.5 0 0 0 10 3.5zM8.3 16a1.8 1.8 0 0 0 3.4 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (selector) => document.querySelector(selector);
const sessionId = new URLSearchParams(location.search).get("sessionId");

let recap = null;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

hydrateMascots(document);
bindEvents();
void load();

async function load() {
  const loadingTimer = setTimeout(() => $("#loadingState").classList.remove("hidden"), 200);

  if (!sessionId) {
    clearTimeout(loadingTimer);
    showError("This link is missing a session. Open a recap from the DriftGuard popup.");
    return;
  }

  recap = await send("DRIFTGUARD_GET_RECAP", { sessionId });
  clearTimeout(loadingTimer);
  $("#loadingState").classList.add("hidden");

  if (!recap?.ok) {
    showError(recap?.error || "We couldn't load this recap.");
    return;
  }

  render(recap);
  $("#recapContent").classList.remove("hidden");
  $("#exportJsonButton").disabled = false;
  $("#exportCsvButton").disabled = false;
  maybeCelebrate();
}

async function send(type, payload = {}) {
  try {
    return await chrome.runtime.sendMessage({ type, payload });
  } catch (error) {
    return { ok: false, error: error?.message || "DriftGuard isn't responding." };
  }
}

function showError(message) {
  $("#errorText").textContent = message;
  $("#errorState").classList.remove("hidden");
  $("#loadingState").classList.add("hidden");
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(data) {
  const { session, stats, progress } = data;
  const summary = session.summary || {};
  const score = focusScore(stats);

  document.title = `${session.intention} · DriftGuard recap`;

  // Hero.
  const { kicker, title, mood } = heroCopy(summary, score, stats);
  $("#heroKicker").textContent = kicker;
  $("#heroTitle").textContent = title;
  $("#heroIntent").textContent = session.intention;
  $("#heroMeta").textContent = [
    formatDate(session.startedAt),
    `${formatTime(session.startedAt)} to ${formatTime(session.endedAt || Date.now())}`,
    session.durationMinutes ? `${session.durationMinutes} min plan` : "Open session"
  ].join(" · ");
  setMascotSlot($("#heroMascot"), mood);

  // Score ring.
  $("#scoreValue").textContent = score === null ? "–" : `${score}%`;
  $("#scoreVerdict").textContent = verdict(score);
  requestAnimationFrame(() => {
    $("#scoreFill").style.strokeDashoffset = String(SCORE_CIRCUMFERENCE * (1 - (score || 0) / 100));
  });

  // Level up.
  if (summary.levelAfter > summary.levelBefore) {
    $("#levelUpText").textContent = `Level up: you climbed from level ${summary.levelBefore} to level ${summary.levelAfter}.`;
    $("#levelUp").classList.remove("hidden");
  }

  // Big stats.
  $("#focusedTime").textContent = formatDuration(stats.alignedSeconds);
  $("#focusedSub").textContent = stats.trackedSeconds
    ? `of ${formatDuration(stats.trackedSeconds)} tracked`
    : "Nothing tracked yet";
  $("#sessionTime").textContent = formatDuration(stats.sessionSeconds);
  $("#sessionSub").textContent = session.durationMinutes
    ? summary.completed
      ? "Finished the full block"
      : `Ended before ${session.durationMinutes} min`
    : "Open-ended";
  $("#caughtCount").textContent = stats.caughtCount;
  $("#caughtSub").textContent = stats.caughtCount ? `Across ${formatDuration(stats.driftSeconds)} off track` : "Not one. Nice.";
  $("#recoveredCount").textContent = stats.recoveredCount;
  $("#recoveredSub").textContent = stats.caughtCount
    ? `${Math.round((Math.min(stats.recoveredCount, stats.caughtCount) / stats.caughtCount) * 100)}% of check-ins`
    : "No check-ins needed";

  renderProgress(summary, progress);
  renderDomains(stats);
  renderWeek(progress);
  renderResponses(stats);
  renderSaved(data.savedItems);
  renderMoments(data.interventions);
}

function heroCopy(summary, score, stats) {
  if (summary.levelAfter > summary.levelBefore) {
    return { kicker: "Session complete", title: `Level ${summary.levelAfter}, unlocked.`, mood: "celebrate" };
  }
  if (summary.completed) {
    return { kicker: "Session complete", title: score >= 80 ? "Locked in. Well done." : "You saw it through.", mood: "celebrate" };
  }
  if (!stats.trackedSeconds) {
    return { kicker: "Session ended", title: "Short one. That counts too.", mood: "happy" };
  }
  if (score !== null && score >= 70) return { kicker: "Session ended", title: "Solid focus.", mood: "celebrate" };
  if (stats.recoveredCount > 0) return { kicker: "Session ended", title: "You kept coming back.", mood: "happy" };
  return { kicker: "Session ended", title: "Every session teaches something.", mood: "thinking" };
}

function focusScore(stats) {
  if (!stats.trackedSeconds) return null;
  return Math.round((stats.alignedSeconds / stats.trackedSeconds) * 100);
}

function verdict(score) {
  if (score === null) return "Not enough browsing to score";
  if (score >= 85) return "Locked in";
  if (score >= 65) return "Mostly on track";
  if (score >= 40) return "Some wandering";
  return "A drifty one";
}

function renderProgress(summary, progress) {
  const xp = summary.xp || { focus: 0, completion: 0, prompts: 0, total: 0 };
  $("#xpGained").textContent = `+${xp.total}`;
  const parts = [
    ["Focused minutes", xp.focus],
    ["Finished the block", xp.completion],
    ["Good check-in answers", xp.prompts]
  ];
  const list = $("#xpParts");
  list.textContent = "";
  for (const [label, value] of parts) {
    const li = document.createElement("li");
    li.className = value ? "" : "zero";
    const name = document.createElement("span");
    name.textContent = label;
    const amount = document.createElement("b");
    amount.className = "num";
    amount.textContent = `+${value}`;
    li.append(name, amount);
    list.append(li);
  }

  const streak = progress.streak;
  $("#streakValue").textContent = `${streak} ${streak === 1 ? "day" : "days"}`;
  const dots = $("#streakDots");
  dots.textContent = "";
  progress.last7.forEach((day, index) => {
    const dot = document.createElement("span");
    if (day.qualified) dot.classList.add("on");
    if (index === progress.last7.length - 1) dot.classList.add("today");
    dots.append(dot);
  });
  $("#streakNote").textContent = summary.qualified
    ? streak > 1
      ? `Today counts. Best streak: ${Math.max(progress.bestStreak, streak)} days.`
      : "Today counts. Come back tomorrow to build it."
    : "Focus 10 minutes in one session to count the day.";

  $("#levelValue").textContent = progress.level;
  $("#levelInto").textContent = progress.into;
  $("#levelNeeded").textContent = progress.needed;
  requestAnimationFrame(() => {
    $("#levelMeter").style.width = `${Math.round(progress.progress * 100)}%`;
  });
  $("#levelNote").textContent = `${progress.needed - progress.into} XP to level ${progress.level + 1} · ${progress.xp} XP total`;
}

function renderDomains(stats) {
  const list = $("#domainBars");
  list.textContent = "";
  $("#trackedMeta").textContent = stats.trackedSeconds ? `${formatDuration(stats.trackedSeconds)} tracked` : "";

  if (!stats.topDomains.length) {
    list.append(emptyNote("No sites tracked in this session."));
    $("#domainLegend").textContent = "";
    return;
  }

  const max = Math.max(...stats.topDomains.map((item) => item.seconds), 1);
  const categories = new Set();

  for (const item of stats.topDomains) {
    categories.add(item.category);
    const li = document.createElement("li");
    li.className = `bar-row cat-${item.category || "unknown"}`;
    li.title = `${item.domain} · ${CATEGORY_LABELS[item.category] || "Other"}`;

    const top = document.createElement("div");
    top.className = "bar-top";
    const name = document.createElement("strong");
    name.textContent = item.domain;
    const time = document.createElement("span");
    time.className = "num";
    time.textContent = formatDuration(item.seconds);
    top.append(name, time);

    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    track.append(fill);

    li.append(top, track);
    list.append(li);
    requestAnimationFrame(() => {
      fill.style.width = `${Math.max(3, (item.seconds / max) * 100)}%`;
    });
  }

  const legend = $("#domainLegend");
  legend.textContent = "";
  for (const category of Object.keys(CATEGORY_LABELS)) {
    if (!categories.has(category)) continue;
    const chip = document.createElement("span");
    chip.className = `chip-cat cat-${category}`;
    chip.textContent = CATEGORY_LABELS[category];
    legend.append(chip);
  }
}

function renderWeek(progress) {
  const chart = $("#weekChart");
  chart.textContent = "";
  const goal = progress.goalMinutes;
  const max = Math.max(goal, ...progress.last7.map((day) => day.minutes), 1);
  const total = progress.last7.reduce((sum, day) => sum + day.minutes, 0);
  $("#weekMeta").textContent = `${formatMinutes(total)} this week`;
  chart.setAttribute(
    "aria-label",
    progress.last7
      .map((day) => `${weekday(day.key, "long")}: ${day.minutes} minutes${day.qualified ? ", streak day" : ""}`)
      .join(". ")
  );

  progress.last7.forEach((day, index) => {
    const col = document.createElement("div");
    col.className = "day";
    if (index === progress.last7.length - 1) col.classList.add("today");
    if (day.qualified) col.classList.add("qualified");

    const barCol = document.createElement("div");
    barCol.className = "day-col";
    const bar = document.createElement("div");
    bar.className = "day-bar";
    if (day.minutes) {
      const value = document.createElement("span");
      value.className = "day-value num";
      value.textContent = formatMinutes(day.minutes);
      bar.append(value);
    }
    barCol.append(bar);

    const label = document.createElement("div");
    label.className = "day-label";
    const text = document.createElement("span");
    text.textContent = index === progress.last7.length - 1 ? "Today" : weekday(day.key, "short");
    const dot = document.createElement("span");
    dot.className = "day-dot";
    label.append(text, dot);

    col.append(barCol, label);
    chart.append(col);
    requestAnimationFrame(() => {
      bar.style.height = `${(day.minutes / max) * 100}%`;
    });
  });

  // Goal line, positioned against the bar area once layout is known.
  const line = document.createElement("div");
  line.className = "goal-line";
  const tag = document.createElement("span");
  tag.textContent = `Goal ${formatMinutes(goal)}`;
  line.append(tag);
  chart.append(line);

  const placeGoalLine = () => {
    const firstCol = chart.querySelector(".day-col");
    if (!firstCol) return;
    line.style.top = `${firstCol.offsetTop + firstCol.offsetHeight * (1 - goal / max)}px`;
  };
  requestAnimationFrame(placeGoalLine);
  addEventListener("resize", placeGoalLine);
}

function renderResponses(stats) {
  const list = $("#responseList");
  list.textContent = "";
  const counts = { ...(stats.responseCounts || {}) };
  if (stats.lockCount > 0) counts.lock = stats.lockCount;
  const entries = Object.entries(counts).filter(([key, count]) => count > 0 && RESPONSES[key]);
  if (!entries.length) {
    list.append(emptyNote("No check-ins this session. DriftGuard stayed quiet."));
    return;
  }

  const order = Object.keys(RESPONSES);
  entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));

  for (const [key, count] of entries) {
    const meta = RESPONSES[key];
    const li = document.createElement("li");
    li.className = "response";
    li.style.setProperty("--tone", meta.tone);
    li.innerHTML = `<span class="response-icon"><svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">${ICONS[meta.icon]}</svg></span>`;
    const copy = document.createElement("span");
    copy.className = "response-copy";
    const label = document.createElement("strong");
    label.textContent = meta.label;
    const note = document.createElement("small");
    note.textContent = meta.note;
    copy.append(label, note);
    const value = document.createElement("span");
    value.className = "response-count num";
    value.textContent = count;
    li.append(copy, value);
    list.append(li);
  }
}

function renderSaved(items) {
  const list = $("#savedList");
  list.textContent = "";
  $("#savedMeta").textContent = items.length ? `${items.length}` : "";
  if (!items.length) {
    list.append(emptyNote("Nothing parked. Save tempting tabs with the shortcut or the check-in card."));
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    if (item.done) li.className = "done";
    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const title = document.createElement("strong");
    title.textContent = item.title || item.domain;
    const meta = document.createElement("span");
    meta.textContent = `${item.domain}${item.done ? " · done" : ""}`;
    link.append(title, meta);
    li.append(link);
    list.append(li);
  }
}

function renderMoments(interventions) {
  const list = $("#momentList");
  list.textContent = "";
  const moments = interventions.filter((item) => !item.isReminder || item.response !== "shown");
  if (!moments.length) {
    $("#momentsPanel").classList.add("hidden");
    return;
  }
  $("#momentsPanel").classList.remove("hidden");

  for (const item of moments.slice().sort((a, b) => a.timestamp - b.timestamp)) {
    const meta = RESPONSES[item.response] || RESPONSES.shown;
    const li = document.createElement("li");
    li.className = "moment";
    li.style.setProperty("--tone", meta.tone);

    const time = document.createElement("time");
    time.className = "num";
    time.dateTime = new Date(item.timestamp).toISOString();
    time.textContent = formatTime(item.timestamp);

    const copy = document.createElement("div");
    copy.className = "moment-copy";
    const head = document.createElement("div");
    head.className = "moment-head";
    const domain = document.createElement("strong");
    domain.textContent = item.domain || "Unknown site";
    head.append(domain);
    if (item.mode === "lock") head.append(flag("Lock", "lock", "Shown as a centre-screen lock"));
    if (item.ai === "off_task") head.append(flag("AI", "ai", item.aiReason || "Flagged by the AI check"));
    const why = document.createElement("span");
    why.textContent = item.title || (item.reasons || [])[0] || (item.isReminder ? "Reminder" : "Check-in");
    copy.append(head, why);

    const tag = document.createElement("span");
    tag.className = "moment-tag";
    tag.textContent = meta.label;

    li.append(time, copy, tag);
    list.append(li);
  }
}

function flag(text, kind, title) {
  const el = document.createElement("em");
  el.className = `moment-flag ${kind}`;
  el.textContent = text;
  el.title = title;
  return el;
}

function emptyNote(text) {
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = text;
  return p;
}

// ---------------------------------------------------------------------------
// Celebration
// ---------------------------------------------------------------------------

function maybeCelebrate() {
  const summary = recap.session.summary || {};
  const worthIt = summary.completed || summary.levelAfter > summary.levelBefore || (summary.xp?.total || 0) >= 10;
  if (!worthIt || reduceMotion) return;

  const key = SEEN_KEY_PREFIX + sessionId;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // Storage blocked: celebrate anyway, it's harmless.
  }
  runConfetti();
}

function runConfetti() {
  const canvas = $("#confetti");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener("resize", resize);

  const count = Math.min(160, Math.round(innerWidth / 8));
  const pieces = Array.from({ length: count }, (_, i) => {
    const fromLeft = i % 2 === 0;
    return {
      x: fromLeft ? -10 : innerWidth + 10,
      y: innerHeight * (0.35 + Math.random() * 0.3),
      vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 9),
      vy: -(9 + Math.random() * 10),
      size: 6 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.35,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      shape: i % 3
    };
  });

  const started = performance.now();
  const DURATION = 3600;

  function frame(now) {
    const t = now - started;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const fade = t > DURATION - 800 ? Math.max(0, (DURATION - t) / 800) : 1;

    for (const p of pieces) {
      p.vy += 0.38;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.shape === 0) {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -p.size / 2);
        ctx.lineTo(p.size / 2, p.size / 2);
        ctx.lineTo(-p.size / 2, p.size / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    if (t < DURATION) requestAnimationFrame(frame);
    else {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      removeEventListener("resize", resize);
    }
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function bindEvents() {
  $("#copyButton").addEventListener("click", copySummary);
  $("#exportJsonButton").addEventListener("click", exportJson);
  $("#exportCsvButton").addEventListener("click", exportCsv);
}

export function buildSummaryText(data) {
  const { session, stats, progress } = data;
  const summary = session.summary || {};
  const score = focusScore(stats);
  const lines = [];

  lines.push(`DriftGuard recap: ${session.intention}`);
  lines.push(
    `${formatDate(session.startedAt)}, ${formatTime(session.startedAt)} to ${formatTime(session.endedAt || Date.now())} · ${formatDuration(stats.sessionSeconds)}${
      session.durationMinutes ? (summary.completed ? " (finished the full block)" : ` (planned ${session.durationMinutes} min)`) : ""
    }`
  );
  lines.push("");
  lines.push(
    score === null
      ? "Focus score: not enough browsing to score"
      : `Focus score: ${score}% (${formatDuration(stats.alignedSeconds)} focused of ${formatDuration(stats.trackedSeconds)} tracked)`
  );
  lines.push(`Drifts caught: ${stats.caughtCount} · Came back: ${stats.recoveredCount}`);
  lines.push(
    `XP: +${summary.xp?.total || 0} · Level ${progress.level} · Streak: ${progress.streak} ${progress.streak === 1 ? "day" : "days"}`
  );

  if (stats.topDomains.length) {
    lines.push("");
    lines.push("Top sites:");
    for (const item of stats.topDomains.slice(0, 5)) {
      lines.push(`- ${item.domain}: ${formatDuration(item.seconds)} (${CATEGORY_LABELS[item.category] || "Other"})`);
    }
  }

  if (data.savedItems.length) {
    lines.push("");
    lines.push("Saved for later:");
    for (const item of data.savedItems) lines.push(`- ${item.title || item.domain}: ${item.url}`);
  }

  return lines.join("\n");
}

async function copySummary() {
  if (!recap?.ok) return;
  const text = buildSummaryText(recap);
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    ok = document.execCommand("copy");
    area.remove();
  }

  const button = $("#copyButton");
  if (ok) {
    button.classList.add("copied");
    $("#copyLabel").textContent = "Copied";
    showNotice("Summary copied. Paste it anywhere.");
    setTimeout(() => {
      button.classList.remove("copied");
      $("#copyLabel").textContent = "Copy summary";
    }, 2000);
  } else {
    showNotice("Couldn't reach the clipboard.");
  }
}

function exportJson() {
  if (!recap?.ok) return;
  const blob = new Blob([JSON.stringify(recap, null, 2)], { type: "application/json" });
  downloadBlob(blob, `driftguard-session-${sessionId}.json`);
}

function exportCsv() {
  if (!recap?.ok) return;
  const rows = [["type", "timestamp", "domain", "title", "duration_seconds", "category", "response", "url"]];
  for (const event of recap.events || []) {
    rows.push(["visit", iso(event.timestamp), event.domain, event.title, event.durationSeconds, event.category, "", ""]);
  }
  for (const item of recap.interventions || []) {
    rows.push(["intervention", iso(item.timestamp), item.domain, item.title, "", item.category || "", item.response, ""]);
  }
  for (const item of recap.savedItems || []) {
    rows.push(["saved", iso(item.timestamp), item.domain, item.title, "", "", "", item.url]);
  }
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), `driftguard-session-${sessionId}.csv`);
}

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formulas.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let noticeTimer = null;
function showNotice(message) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.classList.add("show");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove("show"), 2400);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function iso(timestamp) {
  return timestamp ? new Date(timestamp).toISOString() : "";
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function weekday(key, style) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, { weekday: style });
}
