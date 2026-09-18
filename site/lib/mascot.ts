/**
 * The one place the site maps mascot moods to artwork.
 * To swap in final art, drop files into `public/mascot/` and change the paths
 * here (e.g. `.svg` → `.png`). See /MASCOT.md for the art brief.
 */
export const MASCOT_MOODS = ["idle", "happy", "alert", "sleepy", "celebrate", "thinking"] as const;

export type MascotMood = (typeof MASCOT_MOODS)[number];

export const MASCOT_ART: Record<MascotMood, string> = {
  idle: "/mascot/idle.svg",
  happy: "/mascot/happy.svg",
  alert: "/mascot/alert.svg",
  sleepy: "/mascot/sleepy.svg",
  celebrate: "/mascot/celebrate.svg",
  thinking: "/mascot/thinking.svg",
};

/** Short captions used wherever the site explains a mood. */
export const MASCOT_CAPTIONS: Record<MascotMood, { label: string; when: string }> = {
  idle: { label: "Idle", when: "No session yet. Just hanging out." },
  happy: { label: "Happy", when: "You're in a session and on track." },
  alert: { label: "Alert", when: "A tab is pulling you away. Tap, tap." },
  sleepy: { label: "Sleepy", when: "You're on a break. It's resting too." },
  celebrate: { label: "Celebrate", when: "Session done, streak kept, level up." },
  thinking: { label: "Thinking", when: "Loading, or nothing to show yet." },
};
