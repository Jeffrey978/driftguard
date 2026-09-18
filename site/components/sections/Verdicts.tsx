import { Reveal } from "@/components/Reveal";
import { ScoreMeter } from "./ScoreMeter";

const THRESHOLD = 58; // "balanced" sensitivity in src/background.js

type Verdict = {
  intention: string;
  type: string;
  title: string;
  reasons: [number, string][];
  note: string;
};

/**
 * Scores computed with the extension's own rules (computeDriftScore) for a
 * YouTube tab that has been on screen for two minutes, balanced sensitivity,
 * no recent tab-hopping.
 */
const VERDICTS: Verdict[] = [
  {
    intention: "Fix the auth bug",
    type: "coding",
    title: "Best gaming chairs 2026, honest review",
    reasons: [
      [32, "Ambiguous work/social domain"],
      [26, "Ambiguous site for more than 1 minute"],
      [10, "Tab title appears weakly related to the intention"],
    ],
    note: "Nothing in the title touches the work. This is drift, so it asks.",
  },
  {
    intention: "Study chapter 4: cell biology",
    type: "study",
    title: "Cell biology, chapter 4 explained",
    reasons: [
      [32, "Ambiguous work/social domain"],
      [26, "Ambiguous site for more than 1 minute"],
      [-30, "Tab title closely matches the intention"],
    ],
    note: "Same site, but the title echoes what you set out to do. It stays quiet.",
  },
  {
    intention: "Research SaaS pricing pages",
    type: "research",
    title: "SaaS pricing teardown: 40 pages ranked",
    reasons: [
      [8, "Ambiguous work/social domain"],
      [14, "Ambiguous site for more than 1 minute"],
      [-30, "Tab title closely matches the intention"],
    ],
    note: "Research sessions are expected to roam, so YouTube starts out cheaper.",
  },
];

function total(v: Verdict) {
  return Math.max(0, Math.min(100, v.reasons.reduce((s, [n]) => s + n, 0)));
}

export function Verdicts() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:py-32" aria-labelledby="verdicts-title">
      <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
        <Reveal className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="verdicts-title" className="display text-[clamp(2.1rem,4.6vw,3.3rem)]">
            One site.
            <br />
            Three verdicts.
          </h2>
          <p className="mt-5 max-w-[420px] text-[15.5px] leading-[1.6] text-ink-2">
            Blockers guess: YouTube is bad, full stop. DriftGuard asks what you&rsquo;re trying to do, then
            scores the tab from 0 to 100 on your own machine. Only past the line does it say anything.
          </p>
          <dl className="mt-8 grid max-w-[360px] grid-cols-3 gap-2">
            {[
              ["Calm", 72],
              ["Balanced", 58],
              ["Strict", 44],
            ].map(([name, n]) => (
              <div
                key={name}
                className={`rounded-[12px] border px-3 py-2.5 ${
                  name === "Balanced" ? "border-ink/80 bg-surface" : "border-line"
                }`}
              >
                <dt className="text-[12px] font-semibold text-ink-3">{name}</dt>
                <dd className="tnum text-[20px] font-extrabold tracking-tight">{n}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[12.5px] text-ink-3">Sensitivity is yours to set. The examples use Balanced.</p>
        </Reveal>

        <ol className="space-y-4">
          {VERDICTS.map((v, i) => {
            const score = total(v);
            const asks = score >= THRESHOLD;
            return (
              <li key={v.type}>
                <Reveal delay={i * 0.06} className="rounded-[20px] border border-line bg-surface p-5 shadow-soft sm:p-6">
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold">
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink">
                      Session: {v.intention}
                    </span>
                    <span className="text-ink-3">reads as {v.type}</span>
                  </div>
                  <div className="mt-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-3">
                        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                          <rect x="1" y="3" width="14" height="10" rx="3" fill="#E62117" />
                          <path d="M6.5 5.8v4.4L10.3 8z" fill="#fff" />
                        </svg>
                        youtube.com · 2 min on screen
                      </p>
                      <p className="mt-1 text-[17px] font-bold leading-snug text-ink">&ldquo;{v.title}&rdquo;</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tnum display text-[40px] leading-none">{score}</p>
                      <p
                        className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-bold ${
                          asks ? "bg-brand-soft text-brand-strong" : "bg-[#E7F5EF] text-good"
                        }`}
                      >
                        {asks ? "Asks you" : "Stays quiet"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5">
                    <ScoreMeter score={score} threshold={THRESHOLD} />
                  </div>
                  <ul className="mt-4 space-y-1 text-[13px]">
                    {v.reasons.map(([n, r]) => (
                      <li key={r} className="flex gap-3">
                        <span className={`tnum w-8 shrink-0 text-right font-bold ${n > 0 ? "text-ink" : "text-good"}`}>
                          {n > 0 ? `+${n}` : `−${Math.abs(n)}`}
                        </span>
                        <span className="text-ink-2">{r}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 border-t border-line pt-3 text-[13.5px] font-semibold text-ink">{v.note}</p>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
