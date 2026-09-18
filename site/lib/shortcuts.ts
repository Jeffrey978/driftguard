import type { OS } from "./useOS";

export type Shortcut = { action: string; key: string };

/** Mirrors the extension's `commands` (see /DESIGN.md → Keyboard shortcuts). */
export const SHORTCUTS: Shortcut[] = [
  { action: "Open DriftGuard", key: "D" },
  { action: "Save tab for later", key: "S" },
  { action: "Start / end focus", key: "F" },
];

export function isMac(os: OS) {
  return os === "mac" || os === "ios";
}

/** Keys to render for a shortcut. Unknown OS (SSR) falls back to the Windows spelling. */
export function shortcutKeys(os: OS, key: string): string[] {
  return isMac(os) ? ["⌥", "⇧", key] : ["Alt", "Shift", key];
}

export function shortcutLabel(os: OS, key: string): string {
  return isMac(os) ? `⌥⇧${key}` : `Alt+Shift+${key}`;
}
