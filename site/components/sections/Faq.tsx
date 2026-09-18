import type { ReactNode } from "react";
import { Reveal } from "@/components/Reveal";

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "Why isn’t it in the Chrome Web Store?",
    a: "It’s early. The store listing will come once the build settles. Until then you load it yourself, which takes about a minute and works exactly the same.",
  },
  {
    q: "Does it block sites?",
    a: "No. There’s no blocklist. When a tab looks unrelated to what you said you’re doing, DriftGuard asks one question. You can go back, say it’s for work, save it for later or take a break. Your call, every time. The only time it gets firmer is lock mode, below.",
  },
  {
    q: "What’s lock mode, and can I get past it?",
    a: "If you drift again after taking a break, or wave off the same drift three prompts in a row, the question moves from the corner to the middle of the screen. The page blurs and its video or audio pauses. “Back to work” works straight away. “I really need this” unlocks after 15 seconds and lets that site count as work for the rest of the session. “End session” is always there too. It’s a pause to think, not a wall.",
  },
  {
    q: "What can it see?",
    a: (
      <>
        During a session: the domain and title of the tab you&rsquo;re on and how long you stay, kept in your
        browser. Never keystrokes, form fields, your clipboard or incognito tabs. Page contents and screenshots are
        only used if you turn on the AI check.{" "}
        <a href="#privacy" className="font-bold text-ink underline underline-offset-4">The full list is above.</a>
      </>
    ),
  },
  {
    q: "What does the AI check see?",
    a: (
      <>
        Only if you switch it on (it&rsquo;s off by default): a screenshot of the visible part of the tab, the
        page&rsquo;s address, title, headings and some of its visible text, plus your intention. That goes to
        DriftGuard&rsquo;s server, which asks an AI model through OpenRouter whether the page is part of your task
        and sends back a yes or no with a short reason. Nothing is stored. It never runs on incognito tabs, sites
        you&rsquo;ve excluded or marked as work, or during breaks, and pages with a password field never get a
        screenshot. Leave it off and DriftGuard runs entirely on its local rules.
      </>
    ),
  },
  {
    q: "Which browsers does it work in?",
    a: "Chrome, Edge, Brave, Arc, Opera and Vivaldi, on macOS, Windows, Linux and ChromeOS. Anything built on Chromium. Firefox and Safari use a different extension system and aren’t supported.",
  },
  {
    q: "Why does the install warning say it can read all my data?",
    a: "That’s the browser’s standard wording for any extension that can show something on any site. DriftGuard needs it so the prompt can appear wherever you drift to. It doesn’t read page contents unless you turn on the optional AI check.",
  },
  {
    q: "How does it decide what counts as drift?",
    a: "It compares each tab with your intention: the kind of site, whether the title shares words with what you typed, and how long you’ve been there. Sites you mark as “for work” stop being flagged. The sensitivity setting (calm, balanced, strict) moves the line. With the AI check on, a model also looks at the page itself, so a tutorial on your exact topic counts as work and a music stream doesn’t.",
  },
  {
    q: "Is it free?",
    a: "Yes. No account, no trial, no card.",
  },
  {
    q: "How do I update it?",
    a: "Download the new zip, replace the old DriftGuard folder with the new one in the same place, then press the reload arrow on DriftGuard’s card in the extensions page. Your streak and history stay put.",
  },
  {
    q: "How do I uninstall it?",
    a: "Click Remove on DriftGuard’s card in the extensions page. Everything it stored lives in the browser, so it goes with it.",
  },
];

function Plus() {
  return (
    <span className="chev flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Faq() {
  return (
    <section className="px-4 pb-24 pt-8 sm:px-6 lg:pb-32" aria-labelledby="faq-title">
      <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <Reveal>
          <h2 id="faq-title" className="display text-[clamp(2.1rem,4.6vw,3.3rem)]">
            Questions, <span className="text-brand">answered.</span>
          </h2>
          <p className="mt-4 max-w-[400px] text-[15.5px] leading-[1.6] text-ink-2">
            The short, straight answers. If something&rsquo;s missing, the install steps and privacy list above
            are the source of truth.
          </p>
        </Reveal>
        <Reveal className="faq divide-y divide-line border-y border-line">
          {FAQS.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex items-center justify-between gap-6 py-5 text-[16px] font-bold text-ink transition-colors duration-[160ms] hover:text-brand-strong">
                {f.q}
                <Plus />
              </summary>
              <div className="max-w-[640px] pb-6 pr-12 text-[14.5px] leading-[1.65] text-ink-2">{f.a}</div>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
