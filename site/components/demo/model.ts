export type TabKind = "github" | "docs" | "course" | "youtube" | "reddit";

export type DemoTab = {
  id: "work" | "youtube" | "reddit";
  kind: TabKind;
  domain: string;
  url: string;
  title: string;
  drift: boolean;
};

export const INTENTION_CHIPS = ["Fix the auth bug", "Write launch email", "Study chapter 4"] as const;

export const PRESETS = [
  { id: "25", label: "25m", minutes: 25 },
  { id: "50", label: "50m", minutes: 50 },
  { id: "90", label: "90m", minutes: 90 },
  { id: "open", label: "Open", minutes: 0 },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"];

export const DRIFT_TABS: DemoTab[] = [
  {
    id: "youtube",
    kind: "youtube",
    domain: "youtube.com",
    url: "youtube.com/watch?v=lofi-10h",
    title: "10 hour lofi mix · beats to relax to",
    drift: true,
  },
  {
    id: "reddit",
    kind: "reddit",
    domain: "reddit.com",
    url: "reddit.com/r/mildlyinteresting",
    title: "r/mildlyinteresting · this potato looks like a duck",
    drift: true,
  },
];

/** The "work" tab follows the intention, the way your real work tab would. */
export function workTabFor(intention: string): DemoTab {
  const t = intention.toLowerCase();
  if (/(email|write|draft|essay|blog|copy|post|newsletter|memo|proposal)/.test(t)) {
    return {
      id: "work",
      kind: "docs",
      domain: "docs.google.com",
      url: "docs.google.com/document/d/launch-email",
      title: "Launch email — draft",
      drift: false,
    };
  }
  if (/(study|chapter|lecture|course|exam|homework|class|lesson)/.test(t)) {
    return {
      id: "work",
      kind: "course",
      domain: "coursera.org",
      url: "coursera.org/learn/biology/chapter-4",
      title: "Chapter 4 · Cell structure",
      drift: false,
    };
  }
  if (/(fix|bug|auth|code|debug|build|deploy|ship|refactor|test|implement)/.test(t) || !t.trim()) {
    return {
      id: "work",
      kind: "github",
      domain: "github.com",
      url: "github.com/acme/api/pull/212",
      title: "fix: OAuth callback drops state · #212",
      drift: false,
    };
  }
  return {
    id: "work",
    kind: "docs",
    domain: "notion.so",
    url: "notion.so/today",
    title: intention.trim(),
    drift: false,
  };
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** How the fake AI check names the task: short, like the real reasons do. */
function taskPhrase(work: DemoTab, intention: string): string {
  if (work.domain === "docs.google.com") return "the launch email";
  if (work.kind === "course") return "chapter 4";
  if (work.kind === "github") return "the auth bug";
  return `“${intention}”`;
}

export type DemoVerdict = { reason: string; confidence: number };

/** What the AI check says about a drift tab (the demo's stand-in for POST /api/relevance). */
export function aiVerdictFor(tab: DemoTab, work: DemoTab, intention: string): DemoVerdict {
  const task = taskPhrase(work, intention);
  if (tab.kind === "youtube") return { reason: `This is a lofi music stream, not ${task}.`, confidence: 0.92 };
  if (tab.kind === "reddit") return { reason: `This is a Reddit post about a duck-shaped potato, not ${task}.`, confidence: 0.95 };
  return { reason: `This page doesn’t look like part of ${task}.`, confidence: 0.8 };
}
