# DriftGuard design system

One visual language for the extension (popup, recap, in-page prompt) and the website (`site/`).
Direction: warm, calm, confident. Off-white paper, near-black ink, one orange-red accent that
deepens to crimson. Personality comes from the mascot and from motion, not from decoration.

## Anti-goals (what made v0.1 look machine-made)

- No grid-line / graph-paper backgrounds, no rainbow tri-colour gradients, no glow-everything.
- No walls of equal-weight buttons. Every screen has one obvious primary action.
- No uppercase micro-kickers on every block, no "x" as a close glyph, no emoji as icons.
- No invented social proof (user counts, logos of services we don't integrate with).

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F7F6F4` | `#121110` | page / popup background |
| `--surface` | `#FFFFFF` | `#1C1A19` | cards |
| `--surface-2` | `#F1EFEC` | `#252321` | inputs, wells, chips |
| `--line` | `#E9E6E1` | `#302D2A` | hairlines, 1px borders |
| `--ink` | `#1A1A1A` | `#F4F1EC` | primary text |
| `--ink-2` | `#5B5955` | `#B4AFA8` | secondary text |
| `--ink-3` | `#9A968F` | `#7C776F` | tertiary / placeholders |
| `--brand` | `#E5552E` | `#FF6B3D` | primary buttons, focus, accents |
| `--brand-strong` | `#C8401C` | `#FF8457` | hover / pressed |
| `--brand-soft` | `#FDEDE6` | `#3A1F16` | tinted backgrounds, badges |
| `--crimson` | `#B8202A` | `#E0434C` | deep end of the brand gradient |
| `--good` | `#1F9D6B` | `#3BC38D` | on-track states |
| `--warn` | `#E0A21B` | `#F2B83A` | breaks / paused |

Brand gradient (use sparingly: primary CTA, progress rings, the hero orb):
`linear-gradient(135deg, #FF8A4C 0%, #E5552E 45%, #B8202A 100%)`

## Type

- Family: **Manrope** (variable). Site loads it with `next/font/google`; the extension bundles
  the woff2 in `fonts/`. Fallback: `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  so it reads well on both macOS and Windows.
- Display: weight 700–800, letter-spacing `-0.035em`, line-height 1.02.
- Body: weight 500, 14–16px, line-height 1.5. Labels 600. Numbers use `font-variant-numeric: tabular-nums`.

## Shape & depth

- Radius: 10 (controls), 16 (cards), 24 (panels / hero frame), 999 (pills, primary buttons).
- Shadows are soft and warm: `0 1px 2px rgb(26 26 26 / .04), 0 8px 24px -8px rgb(26 26 26 / .10)`.
  Hero frame: add `0 40px 80px -30px rgb(40 50 80 / .25)` and a 10px translucent white outer ring.

## Motion

- Ease: `cubic-bezier(.2, .8, .2, 1)`; durations 160ms (hover), 280ms (enter), 420ms (hero).
- Enter = fade + 8px rise. Mascot idles with a slow 4s float and blinks; reacts with a spring pop.
- Always honour `prefers-reduced-motion: reduce` (drop transforms, keep opacity).

## Mascot contract

Six moods, same file names everywhere. Source of truth: `assets/mascot/<mood>.svg`
(placeholders). The site copies them to `site/public/mascot/`.

| Mood | When |
|---|---|
| `idle` | no session / neutral |
| `happy` | session running, on-track |
| `alert` | drift prompt |
| `sleepy` | on a break / paused |
| `celebrate` | session complete, streak, level-up |
| `thinking` | loading, empty states |

Each codebase maps moods to files in exactly one place (`src/mascot.js` in the extension,
`site/lib/mascot.ts` on the site), so swapping in the final art is a one-line change per mood.
See `MASCOT.md` for the art brief.

## Keyboard shortcuts (extension `commands`, shown on the site per-OS)

| Action | Windows / Linux | macOS |
|---|---|---|
| Open DriftGuard | `Alt+Shift+D` | `⌥⇧D` |
| Save tab for later | `Alt+Shift+S` | `⌥⇧S` |
| Start / end focus | `Alt+Shift+F` | `⌥⇧F` |

## Downloads

`npm run build:ext` (repo root) writes `site/public/downloads/driftguard-extension.zip`
with forward-slash paths and a single top folder `DriftGuard/`, so it unzips correctly with
macOS Finder/Archive Utility and Windows "Extract All".
