# DriftGuard

DriftGuard is a local-first Chrome extension for focused work. You set an intention and start a session. DriftGuard watches lightweight browser signals (domain, and the tab title unless you turn that off), notices when you probably drifted, and asks one short question in the page. At the end you get a recap with a focus score, streaks and XP.

There is no account and no sync. Everything lives in `chrome.storage.local` on your machine. The one exception is the **AI check**, which is off by default. If you turn it on, the page you're looking at is sent to DriftGuard's server during focus sessions. See [Privacy](#privacy).

## Install (load unpacked)

Download `driftguard-extension.zip` from the website, or build it yourself with `npm run build:ext`.

### macOS

1. Double-click `driftguard-extension.zip` in Finder. It unpacks to a folder called `DriftGuard`.
2. Move the `DriftGuard` folder somewhere permanent, such as `~/Applications` or `~/Documents`. Chrome loads it from that spot every time it starts.
3. Open Chrome and go to `chrome://extensions`.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and choose the `DriftGuard` folder (the one that contains `manifest.json`).
6. Pin DriftGuard from the puzzle-piece menu.

### Windows

1. Right-click `driftguard-extension.zip` and choose **Extract All...**, then click **Extract**.
2. Open the extracted folder. Inside it is a folder called `DriftGuard`. Move it somewhere permanent, such as `Documents`.
3. Open Chrome and go to `chrome://extensions`.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and choose the inner `DriftGuard` folder (the one that contains `manifest.json`).
6. Pin DriftGuard from the puzzle-piece menu.

If you are working from a clone of this repo, you can load the repo folder itself with **Load unpacked**.

Chrome 116 or newer is required.

## Features

- **Focus sessions.** Pick an intention (quick chips remember recent ones) and a length: Open, 25, 50 or 90 minutes. You can also choose to trust the current site for this session.
- **Drift check-ins.** When you drift, an in-page card quotes your intention and gives one reason. You can answer:
  - **Back to work**
  - **It's for work** (trusts that site for this session only)
  - **Save for later**
  - **Break 5m** or **Break 10m**

  When a break ends, a follow-up offers **Back to work** or **5 more minutes**, or, if you're still on a distracting page, the full-screen lock.
- **Lock screen for repeat drift.** A check-in becomes a centre-screen lock if you've already taken a break this session, or on the third prompt of the same drift. The lock blurs and dims the page, pauses video and audio, and blocks scrolling. Escape and clicking outside do nothing, and there's no close button.
  - **Back to work** works straight away.
  - **I really need this** unlocks after a visible 15-second countdown, and then trusts the site for the session.
  - **End session** ends the session and opens the recap.

  The recap counts lock screens and tags those moments **Lock**.
- **AI check (opt-in).** Rules can't tell a tutorial from a rabbit hole. With the AI check on, DriftGuard asks an AI model whether the page fits your intention, once the page has been open for 6 seconds.
  - A confident "on task" answer means no check-in, and the page counts as focus time.
  - A confident "off task" answer makes a check-in more likely, and the model's reason is shown on it with an **AI** tag.
  - Anything unsure, and any error, leaves the normal rules in charge.

  The popup asks once. After that the setting is under **Settings → AI check**. While it's on, the popup shows **AI check on** and the latest answer for the current page.
- **Parking lot.** Saved tabs collect in the popup. From there you can open one, mark it done, remove it, or open them all at once.
- **Recap.** Shows a focus score ring, time on each site coloured by category, how you answered, saved links, and the last 7 days against your goal. It also shows streak, XP and level progress. **Copy summary** puts a plain-text recap on your clipboard, and the data can also be exported as JSON or CSV.
- **Streaks.** A day counts when a session has at least 10 focused minutes.
- **Daily goal.** 120 minutes by default. You can change it in Settings.
- **XP and levels.**
  - You earn 1 XP per focused minute, a bonus for finishing a timed session, and a bonus for good check-in answers.
  - Each level costs about 60 × level XP.
- **Toolbar badge.** Shows minutes left, `||` while paused, and `brk` during a break.
- **Timed sessions finish on their own.** A notification tells you the XP you earned and the recap opens.
- **Pausing.** Sessions pause while you are away from the computer, and resume when you're back. Watching a video doesn't count as away.
- **Timing.** About five minutes on distracting sites in any ten-minute stretch always earns a check-in, however it's split up.
- **Settings.**
  - Sensitivity: calm, balanced or strict.
  - Daily goal.
  - Tab title tracking.
  - Excluded domains.
  - AI check, with an **Advanced** endpoint override.
  - Delete all data.

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Open DriftGuard | Option+Shift+D | Alt+Shift+D |
| Save current tab for later | Option+Shift+S | Alt+Shift+S |
| Start or end focus | Option+Shift+F | Alt+Shift+F |

Start or end focus works like this:

- If a session is running, it ends the session and opens the recap.
- Otherwise it starts a session with your last intention.
- If there is no last intention, it opens DriftGuard.

To change the keys, go to `chrome://extensions/shortcuts`. If another extension has already claimed a key, Chrome leaves that key unassigned.

## Development

Requires Node 18 or newer.

```sh
npm install        # installs fflate, used by the zip builder
npm run check      # syntax-checks every extension and script file
npm test           # domains, streaks, levels, lock, drift scoring, AI-check helpers
npm run build:ext  # writes site/public/downloads/driftguard-extension.zip
```

The zip contains the following, all inside a top-level `DriftGuard/` folder:

- `manifest.json`
- `src/`
- `assets/` (the design-only portraits are left out)
- `fonts/`
- `icons/`
- this README
- the tester guide

### Layout

- `manifest.json`: the MV3 manifest, including commands and web-accessible fonts and mascot art.
- `src/background.js`: the service worker. It owns sessions, drift detection, badge, alarms, commands and notifications. All entry points run through a promise-queue lock.
- `src/content.js`: the in-page check-in card. It lives in a closed shadow root and uses the bundled Manrope font.
- `src/popup.*`: the popup, with idle, active and settings views.
- `src/recap.*`: the session recap page.
- `src/mascot.js`: the Ember mascot. It provides the inline SVG moods and the asset URLs for the content script.
- `src/lib/*.js`: pure helpers (domains, drift scoring, progress, lock, AI-check payload and budget). Node tests import these.
- `src/lib/config.js`: build-time settings, including `AI_ENDPOINT` and the AI-check budget.

### AI check endpoint

The AI check sends requests to `AI_ENDPOINT` in `src/lib/config.js`. By default this is `https://driftguard.vercel.app/api/relevance`, the site's `/api/relevance` route. Change it to point at your own deployment, then rebuild. The request and response contract is in `AI_CHECK.md`.

For local testing, leave the constant alone and set **Settings → AI check → Advanced → AI endpoint**, for example to `http://localhost:3000/api/relevance`. Plain `http://` is accepted only for `localhost`, `127.0.0.1` and `[::1]`. Every other address must use `https://`.

The budget is set in `config.js`:

- at most one call every 10 seconds, and 150 per session
- a 12-second timeout
- a verdict cache of 200 entries per session, keyed by URL without the `#fragment`
- on a `429`, a wait of `retryAfter` seconds
- on a `503`, a 10-minute pause
- `fonts/`: Manrope variable font (SIL Open Font License, see `fonts/OFL.txt`).

## Privacy

DriftGuard records only while a session is active:

- the session intention
- the active domain, and the tab title unless you turn that off
- time spent on observed tabs
- drift check-ins and your answers
- links you saved for later
- daily focus totals, for streaks and the goal

It never records:

- keystrokes, form input or passwords
- screenshots
- clipboard contents, except when you press **Copy summary**
- full page contents
- incognito windows
- anything outside a session

### The AI check (off by default)

With the AI check off, nothing leaves your browser. If you turn it on:

- **What is sent:**
  - your intention
  - the page URL, without the `#fragment` and common tracking parameters
  - the page title, meta description and headings
  - up to about 4,000 characters of visible page text
  - a JPEG screenshot of the visible part of the tab, downscaled to 1024 px wide
  - a little context: the domain of your last on-task tab and its title (the title only if title tracking is on), and up to 5 domains from this session
  - a random install ID, used only for rate limiting
- **When:** only during an active focus session that isn't paused or on a break, and only after the page has held the tab for 6 seconds. Each URL is checked at most once per session.
- **Never sent:**
  - excluded or trusted sites
  - incognito tabs
  - browser pages
  - anything outside a session
  - a screenshot of a page with a visible password field (its text is still sent)
- **Where it goes:** DriftGuard's server, which forwards the request to an AI model through OpenRouter. The server doesn't store the screenshot, the text or the URL.
- **What is kept:** only the answer, stored in this browser: on task or off task, a confidence, and a short reason. The screenshot and text are never saved.

Turn it off at any time in **Settings → AI check**.

**Settings → Delete all data** wipes everything, including streaks, XP and the parking lot.
