# DriftGuard Friend Test Guide

Thanks for testing DriftGuard. This is an early Chrome extension prototype that catches possible browser drift during an intention-based work session.

## Install

1. Unzip `DriftGuard-MVP-test-build.zip`.
2. Open Chrome.
3. Go to `chrome://extensions`.
4. Turn on `Developer mode`.
5. Click `Load unpacked`.
6. Select the unzipped `DriftGuard-MVP-test-build` folder.
7. Pin DriftGuard from the Chrome extensions menu.

## Try The Core Loop

1. Open a normal work page, such as Google Docs, GitHub, Notion, Coursera, or Gmail.
2. Click the DriftGuard extension icon.
3. Enter an intention, for example:
   - `Write launch email`
   - `Fix OAuth callback bug`
   - `Study this Coursera lesson`
4. Keep `Trust this tab` checked if the current page is part of the task.
5. Start the session.
6. Browse normally for a few minutes.
7. Visit a likely drift site such as YouTube, Reddit, X, Instagram, TikTok, or an unrelated shopping/entertainment page.
8. Wait for the DriftGuard prompt.
9. Try each response in separate sessions:
   - Still relevant
   - Save for later
   - Break 5m / Break 10m (a "ready to return?" nudge fires when it ends)
   - Refocus me
10. End the session from the popup and review the recap.

## What To Watch For

Please note:

- Did the session start feel fast and clear?
- Did the prompt appear at a helpful time, too early, too late, or not at all?
- Did any prompt feel annoying or creepy?
- Did "Still relevant" make sense when a site was actually part of the work?
- Did "Save for later" preserve useful off-task links?
- Did "Refocus me" send you somewhere sensible?
- Was the recap understandable?
- Would you use this again for real work?

## Privacy Notes

This prototype stores data locally in Chrome extension storage. It does not use an account or backend server.

It records during active sessions:

- Session intention
- Active domain
- Tab title, unless disabled
- Time spent on observed tabs
- Drift prompts and responses
- Saved-for-later links

It does not record:

- Keystrokes
- Passwords
- Form input
- Screenshots
- Clipboard contents
- Full page contents
- Incognito/private windows
- Activity outside active sessions

## Reset

Open the DriftGuard popup, expand `Privacy controls`, then click `Delete data`.

## Send Feedback

The best feedback is a short note with:

- What task you were trying to do
- What page triggered the prompt
- Whether the prompt was right or wrong
- What you expected DriftGuard to do instead
