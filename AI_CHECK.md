# AI relevance check

Rules alone can't tell a YouTube tutorial on OAuth from a lofi stream. When the AI check is on,
DriftGuard shows the model what is on screen and asks one question: *is this part of the task?*

## Flow

```
extension (service worker)                 site (Vercel)                    OpenRouter
  new page, dwell >= 6s
  capture visible tab (JPEG, <=1024px)
  extract page text (title, url, headings,
    meta description, ~3000 chars visible)
  POST /api/relevance  ───────────────────▶  validate, rate-limit
                                             holds OPENROUTER_API_KEY  ──▶  vision model
                        ◀───────────────────  { related, confidence,  ◀──  JSON verdict
                                                reason }
  fold verdict into drift score
```

The key never ships in the extension. Nothing is stored server-side: no screenshots, no text, no logs
of page content.

## Endpoint contract

`POST {AI_ENDPOINT}` (default `https://<site>/api/relevance`, configurable in
`src/lib/config.js` and overridable in Settings → Advanced for local dev, e.g. `http://localhost:3000/api/relevance`).

Headers: `Content-Type: application/json`, `X-DriftGuard-Install: <uuid>` (random per install,
stored locally), `X-DriftGuard-Version: <manifest version>`.

```jsonc
{
  "intention": "Write launch email",                // <= 200 chars
  "page": {
    "url": "https://www.youtube.com/watch?v=...",   // <= 2048, query string stripped of tracking params is fine
    "title": "10 hour lofi mix · beats to relax",   // <= 300
    "description": "…",                             // optional, <= 500
    "headings": ["…"],                              // optional, <= 20 items, each <= 200
    "text": "…"                                     // optional, <= 4000 visible text
  },
  "context": {                                       // optional; helps the model know what "the work" looks like
    "workTitle": "Launch email draft - Google Docs",
    "workDomain": "docs.google.com",
    "recentDomains": ["docs.google.com", "mail.google.com"]   // <= 5
  },
  "screenshot": "data:image/jpeg;base64,..."         // optional, <= 700000 chars
}
```

`200`:

```json
{ "related": false, "confidence": 0.92, "reason": "This is a lofi music stream, not the launch email.", "model": "google/gemini-2.5-flash-lite" }
```

- `confidence` 0..1. `reason` <= 120 chars, second person, friendly, no scolding; shown in the prompt.
- Errors: `400` bad body, `413` too large, `429` `{ "retryAfter": seconds }`, `503` not configured
  (no key), `502` upstream failure. On **any** error the extension silently falls back to rules.

## How the verdict is used

| Verdict | Effect |
|---|---|
| `related` and confidence >= 0.7 | Treated as on-task: no prompt, page may become the Refocus target. |
| not related and confidence >= 0.7 | +35 drift score, AI reason shown in the prompt, prompt can fire right away. |
| anything else | Rules decide, as before. |

Verdicts are cached per URL (hash stripped) for the session. Explicitly trusted domains
("It's for work", "Trust this tab") and excluded domains are never sent.

## Privacy guardrails

- **Off by default.** Turned on from a consent card that says exactly what is sent and where.
- Never runs on incognito tabs, excluded domains, non-http(s) pages, or during breaks/pauses.
- Skips the screenshot (text only) when the page shows a password field.
- Budget: at most one check per 10 s, 150 per session.
- Server: validates sizes, per-install + per-IP rate limit, no persistence, no content logging.

## Lock mode (the centre-screen prompt)

The normal prompt is a corner card. It escalates to a full-screen lock when, in the same session:

1. a break has already been taken and the user drifts again, or
2. the same drift has been ignored through 3 prompts.

Lock: page blurred and dimmed behind a wide centred card, page media paused, scroll locked,
no close button, Escape does nothing. "Back to work" is live immediately. "I really need this"
unlocks after a 15 s countdown (then counts as "It's for work" for this session). "End session"
is always available as a quiet link.
