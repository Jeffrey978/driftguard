# DriftGuard MVP

DriftGuard is a local-first Chrome extension that lets a user start an intention-based work session, watches lightweight browser activity, detects likely work drift with simple local rules, prompts the user at the moment of drift, saves off-task pages for later, and shows an end-of-session recap.

This is the validation wedge from `DriftGuard_PRD_and_MVP.md`. It is intentionally not a full productivity platform.

## What is included

- Chrome Manifest V3 extension
- Manual focus sessions with one-sentence intention
- Active tab/domain/title tracking only during sessions
- Rule-based drift detection
- In-page drift intervention overlay
- Five responses: still relevant, save for later, break 5m, break 10m, refocus me
- Desktop notification fallback when a page blocks the in-page overlay
- End-of-break "ready to return?" prompt
- Local save-for-later list
- End-of-session recap
- Local privacy controls
- No account, server, cloud sync, screenshots, keystrokes, or page-content capture

## Install locally

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder: `C:\Users\USER\Desktop\Building phase`.
6. Pin DriftGuard from the extensions menu.

## Test the core loop

1. Open a normal website such as Google Docs, GitHub, or Notion.
2. Click the DriftGuard extension icon.
3. Enter an intention like `Write launch email` or `Fix auth bug`.
4. Start the session.
5. Browse to an ambiguous or distracting site such as YouTube, Reddit, X, Instagram, or TikTok.
6. Wait for the drift prompt.
7. Choose a response.
8. End the session from the popup.
9. Open the recap.

## Development checks

Run syntax checks:

```powershell
npm run check
```

No package install is required for the current MVP.

## Privacy posture

By default, DriftGuard stores data locally in Chrome extension storage. It does not send activity data to a backend.

The MVP records:

- Session intention
- Active domain
- Active tab title, unless disabled
- Time spent on observed tabs during active sessions
- Drift prompts and responses
- Saved-for-later links

The MVP does not record:

- Keystrokes
- Form input
- Passwords
- Screenshots
- Clipboard contents
- Full page contents
- Incognito/private windows (split mode; incognito tabs are skipped outright)
- Activity outside active sessions

