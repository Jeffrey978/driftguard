# Deploying the DriftGuard site

The site is a Next.js 16 app (App Router, Tailwind v4, `motion`) in this `site/` folder.
It is deployed on Vercel with `site` as the project's root directory.

## Local

```bash
cd site
npm install
npm run dev          # http://localhost:3000
npm run build && npm run start   # production check
npm run lint
npm run test         # API helpers (node --test, no extra deps)
```

## The extension download

The Download buttons link to `/downloads/driftguard-extension.zip`, served from
`site/public/downloads/`. The site does not build that zip itself. Build it from the repo root:

```bash
# from the repo root, not site/
npm run build:ext    # writes site/public/downloads/driftguard-extension.zip
```

Rebuild the zip before every deploy that ships a new extension version. `vercel.json` serves it
as `application/zip` with `Content-Disposition: attachment` and no long-lived cache, so a
redeploy replaces it straight away.

## Vercel settings

| Setting | Value |
|---|---|
| Root Directory | `site` |
| Framework Preset | Next.js (also pinned in `vercel.json`) |
| Build / Output / Install | defaults |
| Node.js | 20.9 or newer (Next 16 requirement) |

`metadataBase` uses Vercel's `VERCEL_PROJECT_PRODUCTION_URL` (falling back to `VERCEL_URL`) so
Open Graph URLs are absolute.

## The AI check endpoint (`POST /api/relevance`)

The optional AI check in the extension (see `/AI_CHECK.md`) calls `app/api/relevance/route.ts`,
which forwards the page to a vision model through OpenRouter and returns
`{ related, confidence, reason, model }`. The landing page works without it; with no key the
endpoint answers `503 {"error":"not_configured"}` and the extension silently falls back to its
local rules.

### Environment variables

All server-only (none are `NEXT_PUBLIC_*`, so they never reach the browser bundle). Documented in
`.env.example`; for local dev copy it to `.env.local`.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `OPENROUTER_API_KEY` | yes, for the AI check | none | From https://openrouter.ai/keys. Give the key a monthly credit limit. |
| `OPENROUTER_MODEL` | no | `google/gemini-2.5-flash-lite` | Primary model. |
| `OPENROUTER_FALLBACK_MODEL` | no | `google/gemini-3.1-flash-lite` | Sent as the second entry of OpenRouter's `models` array; used if the primary errors. |
| `SITE_URL` | no | `https://$VERCEL_PROJECT_PRODUCTION_URL` | Sent as `HTTP-Referer` for OpenRouter attribution. |

On Vercel:

1. Open the project → **Settings** → **Environment Variables**.
2. Add `OPENROUTER_API_KEY`, paste the key, tick **Production** (and **Preview** only if you want
   preview deployments to spend credits). Mark it **Sensitive**.
3. Optionally add `OPENROUTER_MODEL` / `OPENROUTER_FALLBACK_MODEL` / `SITE_URL` the same way.
4. **Redeploy** (Deployments → latest → ⋯ → Redeploy). Env changes only apply to new deployments.

Or from the CLI: `npx vercel env add OPENROUTER_API_KEY production`.

Check it: `curl -i -X OPTIONS https://<domain>/api/relevance` should return `204`, and a POST with
a bad body should return `400` (not `503`, which means the key is missing).

### Rate limiting: add a Vercel Firewall rule

The route has a best-effort, **in-memory** sliding-window limit (30/min and 600/day per install id,
60/min per IP). On serverless every function instance keeps its own counters, and instances come
and go, so that limit is per instance, not global. The real limit belongs in the Vercel Firewall,
which runs before the function (blocked requests aren't billed) and counts across instances.

Dashboard steps:

1. Project → **Firewall** → **Configure** → **+ New Rule**.
2. Name: `Rate limit AI check`.
3. **If**: `Request Path` · `Equals` · `/api/relevance`. Add condition (AND): `Method` · `Equals` · `POST`.
4. **Then**: **Rate Limit**. Fixed window, **60 seconds**, **60 requests**, key **IP Address**.
   When exceeded: **Too Many Requests (429)**. (The extension already treats any 429 as
   "fall back to rules".)
5. **Save Rule**, then **Review Changes** → **Publish**.

Start with the action set to **Log** for a day if you want to see real traffic first, then switch it
to 429. Counters are per region, so the effective ceiling can be a few times higher. Equivalent CLI
(after `npx vercel link`):

```bash
npx vercel firewall rules add "Rate limit AI check" \
  --condition '{"type":"path","op":"eq","value":"/api/relevance"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --action rate_limit --rate-limit-window 60 --rate-limit-requests 60 \
  --rate-limit-keys ip --rate-limit-action rate_limit --yes
npx vercel firewall diff
npx vercel firewall publish --yes
```

Also set a **credit limit on the OpenRouter key** (OpenRouter → Keys → edit) as a hard spend cap.

### Cost

Each check is about 3k tokens: roughly 1.3k for the prompt and page text, plus the screenshot
(a ≤1024px JPEG is on the order of 1–1.5k image tokens on Gemini), and a ~40-token JSON reply.
On `google/gemini-2.5-flash-lite` at $0.10 per million input tokens and $0.40 per million output
tokens:

| | Tokens | Cost |
|---|---|---|
| Input | ~3,000 | ~$0.0003 |
| Output | ~40 | ~$0.000016 |
| **Per check** | | **≈ $0.0003** |
| **Per 1,000 checks** | | **≈ $0.30** |

The extension caps itself at one check per 10 s and 150 per session, so a heavy user doing three
sessions a day is at most ~450 checks, about $0.14/day, and typical use is far lower because
verdicts are cached per URL and trusted/excluded sites are never sent. Prices are OpenRouter's list
prices at the time of writing; check the model page before relying on them.

### Privacy guarantees to keep

- Never log request bodies, page text, URLs or screenshots. The route logs one JSON line per request:
  `status`, `ms`, `model`.
- No persistence: no database, no blob storage, no caching of verdicts server-side
  (`Cache-Control: no-store`).

### Tests

```bash
npm run test   # node --test on tests/*.test.ts (validation, parser, limiter, CORS, prompt)
```

## Deploy

```bash
npm run build:ext            # from the repo root
cd site && npx vercel --prod # or push to the connected Git branch
```

After deploying, check that `https://<domain>/downloads/driftguard-extension.zip` downloads
rather than 404s. If it 404s, the zip was not in `site/public/downloads/` when the build ran.

## Swapping art

- Mascot: replace the files in `public/mascot/` (copied from `assets/mascot/`). Paths are mapped in one
  place, `lib/mascot.ts`.
- Favicon / app icons: `public/icons/icon{16,32,48,128}.png`, wired in `app/layout.tsx`.
- Social card: `app/opengraph-image.tsx` (generated at build).
