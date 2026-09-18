# DriftGuard Tester Guide

Thanks for testing DriftGuard. It's a Chrome extension that helps you stay on the task you meant to do. When you drift, it asks one short question.

## Install

You need Chrome 116 or newer.

### macOS

1. Double-click `driftguard-extension.zip`. Finder unpacks it to a folder called `DriftGuard`.
2. Move that folder somewhere it can stay, such as `Documents`. Don't delete it later, because Chrome loads the extension from it.
3. In Chrome, go to `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `DriftGuard` folder.
5. Pin DriftGuard from the puzzle-piece menu.

### Windows

1. Right-click `driftguard-extension.zip`, choose **Extract All...**, then click **Extract**.
2. Inside the extracted folder there is a `DriftGuard` folder. Move it somewhere it can stay, such as `Documents`.
3. In Chrome, go to `chrome://extensions` and turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `DriftGuard` folder. Pick the one that has `manifest.json` directly inside it.
5. Pin DriftGuard from the puzzle-piece menu.

If you tested an earlier build, remove it on `chrome://extensions` first.

## Try the core loop

1. Open a work page, such as Google Docs, GitHub, Notion or Gmail.
2. Open DriftGuard. Click the icon, or press Option+Shift+D on a Mac or Alt+Shift+D on Windows.
3. Type an intention, for example `Write launch email`, or tap one of the chips.
4. Pick a length: Open, 25, 50 or 90 minutes.
5. Leave **Trust this tab** on if the current page is part of the task.
6. Click **Start focus**. The toolbar badge now counts down the minutes left.
7. Work for a bit, then visit a likely drift site such as YouTube, Reddit, X, Instagram or TikTok.
8. Wait for the check-in card. Try a different answer in each session:
   - **Back to work** takes you back to your last on-task tab.
   - **It's for work** trusts that site for this session only.
   - **Save for later** parks the tab in the popup.
   - **Break 5m** or **Break 10m**. When the break ends, you get **Back to work** or **5 more minutes**. If you're still on a distracting site (YouTube, Reddit, social, streaming) when it ends, you get the full-screen lock instead.
9. End the session from the popup, or let a timed session finish. Either way the recap opens.

## New in this build

- **Streaks and a daily goal.** The popup shows today's minutes against your goal (120 by default) and your streak. A day counts once you focus 10 minutes in one session.
- **XP and levels.** You earn XP for focused minutes, finishing a timed session and good answers. The mascot celebrates when you level up.
- **Parking lot.** Saved tabs appear in the popup. You can open one, tick it done, remove it, or open all of them.
- **Keyboard shortcuts.** On Windows, use Alt instead of Option.
  - Option+Shift+S saves the current tab for later.
  - Option+Shift+F starts a session with your last intention, or ends the one that is running.
- **New recap.** It includes a focus score, the sites you visited coloured by category, the last 7 days, and **Copy summary**.
- **Pausing.** Sessions pause automatically while you are away from the computer (a playing video doesn't count as away). You can also pause by hand.
- **Timing.** On YouTube or social sites the first check-in usually comes after about a minute. About five minutes of drift in any ten-minute stretch always brings one.
- **Settings.** Click the gear in the popup to change sensitivity, your daily goal, title tracking, excluded sites, or to delete your data.
- **Dark mode.** DriftGuard follows your system theme.
- **Lock screen (new in 0.3).** If you keep drifting, the check-in moves to the centre of the screen. This happens after you've taken a break, or on the third prompt of the same drift. The page is blurred and paused.
  - **Back to work** works right away.
  - **I really need this** unlocks after 15 seconds.
  - **End session** stops the session and opens the recap.
- **AI check (new in 0.3, opt-in).** The popup asks once: "Let DriftGuard see the page?" If you turn it on, DriftGuard asks an AI model whether each page fits your intention.
  - The check runs after a page has been open for 6 seconds.
  - A confident "on task" answer means no check-in.
  - A confident "off task" answer shows the model's reason on the check-in, with an **AI** tag.
  - You can switch it on or off in Settings.

## What to watch for

- Did starting a session feel quick and clear?
- Did the check-in come at a helpful moment? Or was it too early, too late, or missing?
- Did any check-in feel annoying or creepy?
- Did the lock screen feel fair, or too heavy-handed?
- With the AI check on, were its answers right? Note any page it got wrong.
- Did it ever flag a site that was clearly work?
- Did "It's for work" and "Save for later" do what you expected?
- Were the streak, goal and XP motivating or noise?
- Was the recap clear? Did you copy the summary anywhere?
- Did you use the keyboard shortcuts?
- Would you use this again for real work?

## Privacy notes

Everything stays in Chrome's local storage on your computer. There is no account.

The only exception is the **AI check**, which is off unless you turn it on. When it's on:

- **What is sent:** a screenshot of the visible tab and the page text (title, description, headings and some visible text), along with your intention.
- **When:** only during focus sessions, and only after a page has been open for a few seconds.
- **Where it goes:** DriftGuard's server, which asks an AI model through OpenRouter.
- **What is kept:** nothing is stored on the server. Only the yes/no answer is kept in your browser.
- **Never sent:**
  - excluded sites
  - incognito tabs
  - anything outside a session
  - a screenshot of a page with a password field (its text is still sent)

During a session DriftGuard records:

- your intention
- the active site and tab title (you can turn titles off in Settings)
- time on each site
- check-ins and your answers
- links you saved
- daily focus totals

It never records (and with the AI check on, never stores):

- keystrokes, passwords or form input
- screenshots
- page contents
- incognito windows
- anything outside a session

## Reset

Open DriftGuard, click the gear, then **Delete all data**, and click it again to confirm.

## Send feedback

A short note is perfect:

- what you were trying to do
- which page triggered a check-in
- whether it was right or wrong
- what you expected DriftGuard to do instead

A screenshot of the recap helps too.
