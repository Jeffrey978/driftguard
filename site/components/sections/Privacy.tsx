import { Reveal } from "@/components/Reveal";

const RECORDED = [
  ["Your intention", "The sentence you type when you start a session."],
  ["Domains you visit", "Only while a session is running, to tell work tabs from drift."],
  ["Tab titles", "Used to match pages to your intention. Switch it off in settings."],
  ["Time on each tab", "So the recap can show where the minutes went."],
  ["Prompts and your answers", "Back to work, it’s for work, save for later, break."],
  ["Links you save for later", "Kept in the parking lot until you open or clear them."],
];

const NEVER = [
  "Keystrokes or anything you type",
  "Form fields and passwords",
  "Your clipboard",
  "Incognito tabs",
  "Anything outside a session",
  "Page text or screenshots, kept anywhere",
  "Accounts, analytics or ad tracking",
];

const AI_SENT = [
  ["A screenshot of the visible tab", "Just what's on screen, shrunk to a small JPEG."],
  ["The page's text", "Address, title, headings and a few thousand characters of visible text."],
  ["Your intention", "So the model knows what “part of the task” means."],
];

const AI_NEVER = [
  "Incognito tabs",
  "Sites you've excluded",
  "Sites you marked as work",
  "Breaks and pauses",
  "Screenshots of pages with a password field",
];

const FLOW = [
  ["Your browser", "Captures the tab, only with the AI check on"],
  ["DriftGuard's server", "Checks the request, stores nothing"],
  ["AI model, via OpenRouter", "Answers yes or no, with a reason"],
];

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mt-[3px] shrink-0">
      <circle cx="8" cy="8" r="8" fill="rgb(59 195 141 / .16)" />
      <path d="m4.8 8.2 2.1 2.1 4.3-4.5" fill="none" stroke="#3BC38D" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mt-[3px] shrink-0">
      <circle cx="8" cy="8" r="8" fill="rgb(255 107 61 / .16)" />
      <path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" stroke="#FF6B3D" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Dot() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mt-[3px] shrink-0">
      <circle cx="8" cy="8" r="8" fill="rgb(255 255 255 / .1)" />
      <path d="M5 8h6m-2.4-2.6L11 8l-2.4 2.6" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Privacy() {
  return (
    <section id="privacy" className="scroll-mt-6 px-4 py-8 sm:px-6" aria-labelledby="privacy-title">
      <div className="mx-auto max-w-[1240px] rounded-[32px] bg-ink px-6 py-16 text-white sm:px-10 lg:px-16 lg:py-24">
        <Reveal className="max-w-[680px]">
          <h2 id="privacy-title" className="display text-[clamp(2.1rem,4.6vw,3.3rem)]">
            The honest version.
          </h2>
          <p className="mt-4 text-[15.5px] leading-[1.6] text-white/70">
            DriftGuard needs to see which tab you&rsquo;re on to do its job. Here is all of it, in plain words.
            By default, everything stays in your browser&rsquo;s extension storage, on your machine. Nothing
            leaves it unless you switch on the AI check.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
          <Reveal>
            <h3 className="text-[15px] font-bold text-white">Recorded on your machine, during a session</h3>
            <ul className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {RECORDED.map(([k, v]) => (
                <li key={k} className="flex gap-3">
                  <Check />
                  <div>
                    <p className="text-[14.5px] font-bold">{k}</p>
                    <p className="mt-0.5 text-[13.5px] leading-[1.55] text-white/60">{v}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.06}>
            <h3 className="text-[15px] font-bold text-white">Never recorded, in any mode</h3>
            <ul className="mt-5 space-y-3">
              {NEVER.map((t) => (
                <li key={t} className="flex gap-3 text-[14.5px] font-semibold text-white/85">
                  <Cross />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal className="mt-14 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04]">
          <div className="grid gap-10 p-6 sm:p-8 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:p-10">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-[12.5px] font-bold text-white/80">
                <span className="relative inline-flex h-[14px] w-6 rounded-full bg-white/20" aria-hidden="true">
                  <span className="absolute left-0.5 top-0.5 size-2.5 rounded-full bg-white/70" />
                </span>
                Off by default
              </span>
              <h3 className="display mt-4 text-[clamp(1.6rem,3vw,2.1rem)]">The AI check, only if you turn it on.</h3>
              <p className="mt-3 max-w-[520px] text-[14.5px] leading-[1.65] text-white/70">
                Rules can&rsquo;t tell a YouTube tutorial on OAuth from a lofi stream. So there&rsquo;s an optional
                AI check. You switch it on from a card that says exactly what it sends. From then on, when you
                settle on a new page during a session, DriftGuard sends that page to its own server, which asks an
                AI model through OpenRouter one question: is this part of the task? It gets back a yes or no and a
                one-line reason, and that&rsquo;s it.
              </p>
              <p className="mt-3 max-w-[520px] text-[14.5px] leading-[1.65] text-white/70">
                <span className="font-bold text-white">Nothing is stored.</span> DriftGuard&rsquo;s server keeps no
                screenshots, no page text and no record of which pages you checked. OpenRouter and the model provider
                handle each request under their own privacy terms.
              </p>
            </div>

            <div className="space-y-8">
              <div>
                <h4 className="text-[15px] font-bold text-white">What each check sends</h4>
                <ul className="mt-4 space-y-4">
                  {AI_SENT.map(([k, v]) => (
                    <li key={k} className="flex gap-3">
                      <Dot />
                      <div>
                        <p className="text-[14.5px] font-bold">{k}</p>
                        <p className="mt-0.5 text-[13.5px] leading-[1.55] text-white/60">{v}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-[15px] font-bold text-white">Never checked</h4>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {AI_NEVER.map((t) => (
                    <li key={t} className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[13px] font-semibold text-white/85">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <ol className="grid border-t border-white/10 sm:grid-cols-3" aria-label="Where an AI check goes">
            {FLOW.map(([k, v], i) => (
              <li
                key={k}
                className="relative flex items-start gap-3 px-6 py-5 max-sm:border-t max-sm:border-white/10 max-sm:first:border-t-0 sm:px-8 sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-white/10"
              >
                <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-extrabold">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[14px] font-bold">{k}</p>
                  <p className="mt-0.5 text-[13px] leading-[1.5] text-white/55">{v}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal className="mt-6 rounded-[20px] border border-white/10 bg-white/[0.04] p-6 sm:p-7">
          <h3 className="text-[16px] font-extrabold">About that install warning</h3>
          <p className="mt-2 max-w-[820px] text-[14.5px] leading-[1.65] text-white/70">
            When you load DriftGuard, your browser will say it can &ldquo;read and change all your data on all
            websites.&rdquo; That&rsquo;s the standard wording for any extension that can show something on any
            page. DriftGuard needs it so the prompt can appear on whatever site you drift to. It doesn&rsquo;t
            read the page itself unless you turn on the AI check, and even then it sends only what&rsquo;s listed
            above, to DriftGuard&rsquo;s own server.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
