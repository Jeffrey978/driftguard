import type { ReactNode } from "react";
import { Mascot } from "@/components/Mascot";
import { LogoMark } from "@/components/LogoMark";
import { Reveal } from "@/components/Reveal";
import { ShortcutList, TimerRing, WeeklyBars } from "./FeatureBits";
import { Favicon } from "@/components/demo/FakePages";

function Tile({
  className,
  title,
  body,
  children,
  delay = 0,
}: {
  className?: string;
  title: string;
  body: ReactNode;
  children?: ReactNode;
  delay?: number;
}) {
  return (
    <Reveal
      delay={delay}
      className={`flex flex-col overflow-hidden rounded-[24px] border border-line bg-surface p-6 shadow-soft sm:p-7 ${className ?? ""}`}
    >
      <h3 className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">{title}</h3>
      <p className="mt-2 max-w-[440px] text-[14.5px] leading-[1.6] text-ink-2">{body}</p>
      {children}
    </Reveal>
  );
}

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function Features() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:py-32" aria-labelledby="features-title">
      <div className="mx-auto max-w-[1180px]">
        <Reveal className="max-w-[640px]">
          <h2 id="features-title" className="display text-[clamp(2.1rem,4.6vw,3.3rem)]">
            Small nudges, <span className="text-brand">stacked up.</span>
          </h2>
          <p className="mt-4 text-[15.5px] leading-[1.6] text-ink-2">
            The prompt is the heart of it. Everything else is there to make coming back feel good.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-12">
          {/* Timer */}
          <Tile
            className="lg:col-span-7"
            title="A timer that rides on the toolbar"
            body="Pick 25, 50 or 90 minutes, or leave it open. The countdown sits on the DriftGuard icon, so you know how long is left without opening anything."
          >
            <div className="mt-8 flex flex-1 flex-col items-center gap-8 sm:flex-row sm:items-end sm:justify-between">
              <TimerRing />
              <div className="flex flex-col items-center gap-4 sm:items-end">
                <div className="flex gap-1.5">
                  {["25m", "50m", "90m", "Open"].map((p) => (
                    <span
                      key={p}
                      className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold ${
                        p === "25m" ? "bg-ink text-white" : "bg-surface-2 text-ink-2"
                      }`}
                    >
                      {p}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-3 rounded-full border border-line bg-bg py-2 pl-4 pr-3">
                  <span className="text-[12px] font-semibold text-ink-3">Toolbar</span>
                  <span className="h-4 w-px bg-line" />
                  <span className="relative flex size-7 items-center justify-center">
                    <LogoMark size={20} />
                    <span className="tnum absolute -bottom-1 -right-2 rounded-[5px] bg-brand px-1 text-[9.5px] font-extrabold leading-[14px] text-white">
                      10m
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </Tile>

          {/* Streaks */}
          <Tile
            className="lg:col-span-5"
            delay={0.05}
            title="Streaks, a daily goal, levels"
            body="Pick a daily goal (two hours to start). Ten focused minutes keeps the streak alive, and every finished session earns XP toward the next level."
          >
            <div className="mt-6 flex items-center gap-4">
              <Mascot mood="celebrate" size={76} />
              <div>
                <p className="display text-[30px] leading-none">6-day streak</p>
                <div className="mt-2 flex gap-1.5" aria-label="Six of seven days hit">
                  {DAYS.map((d, i) => (
                    <span
                      key={i}
                      className={`flex size-6 items-center justify-center rounded-full text-[10.5px] font-bold ${
                        i < 6 ? "bg-brand text-white" : "border border-dashed border-ink-3/60 text-ink-3"
                      }`}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <div>
                <div className="flex justify-between text-[12.5px] font-semibold">
                  <span className="text-ink">Today&rsquo;s goal</span>
                  <span className="tnum text-ink-2">1h 40m / 2h</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full w-[83%] rounded-full" style={{ background: "var(--brand-gradient)" }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[12.5px] font-semibold">
                  <span className="text-ink">Level 4</span>
                  <span className="tnum text-ink-2">160 / 240 XP to level 5</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full w-[67%] rounded-full bg-ink" />
                </div>
              </div>
            </div>
          </Tile>

          {/* Lock mode */}
          <Tile
            className="lg:col-span-5"
            title="Lock mode after a break"
            body="Drift again right after a break and the question moves to the middle of the screen. The page blurs and pauses. Back to work is one click; “I really need this” opens after 15 seconds."
          >
            <div className="relative mt-6 flex min-h-[220px] flex-1 items-center justify-center overflow-hidden rounded-[16px] border border-line bg-[#2B1B4B]">
              <div
                className="absolute inset-0 scale-110 blur-[6px]"
                style={{ background: "linear-gradient(135deg, #2B1B4B 0%, #6B3A7A 45%, #F08A6B 100%)" }}
                aria-hidden="true"
              />
              <div className="absolute inset-0 bg-[rgb(26_26_26/.35)]" aria-hidden="true" />
              <div className="relative mx-4 w-full max-w-[300px] rounded-[18px] bg-surface p-4 text-center shadow-lift">
                <div className="mx-auto w-fit">
                  <Mascot mood="alert" size={48} />
                </div>
                <p className="display mt-1 text-[17px]">Let&rsquo;s finish what you started.</p>
                <p className="mt-1 truncate text-[12px] text-ink-2">
                  You set out to <span className="font-bold text-ink">Write launch email</span>.
                </p>
                <div className="mt-3 grid gap-1.5">
                  <span className="flex h-8 items-center justify-center rounded-full bg-brand text-[12px] font-bold text-white">
                    Back to work
                  </span>
                  <span className="tnum flex h-8 items-center justify-center rounded-full border border-line text-[12px] font-bold text-ink-3">
                    I really need this · 12s
                  </span>
                </div>
              </div>
            </div>
          </Tile>

          {/* AI check */}
          <Tile
            className="lg:col-span-7"
            delay={0.05}
            title="AI that reads the page"
            body={
              <>
                Titles only go so far. Switch on the optional AI check and a model looks at what&rsquo;s actually on
                screen, so an OAuth tutorial counts as work and a lofi stream doesn&rsquo;t. Off by default.{" "}
                <a href="#privacy" className="font-bold text-ink underline underline-offset-4">
                  What it sends
                </a>
              </>
            }
          >
            <div className="mt-6 grid flex-1 gap-3 sm:grid-cols-2">
              {[
                {
                  kind: "youtube" as const,
                  title: "OAuth 2.0 PKCE, explained in 12 minutes",
                  related: true,
                  pct: 94,
                  reason: "A tutorial on the exact flow behind the auth bug.",
                },
                {
                  kind: "youtube" as const,
                  title: "10 hour lofi mix · beats to relax to",
                  related: false,
                  pct: 92,
                  reason: "This is a lofi music stream, not the auth bug.",
                },
              ].map((v) => (
                <figure key={v.title} className="flex flex-col rounded-[16px] border border-line bg-bg p-3">
                  <div
                    className="relative aspect-[16/8] overflow-hidden rounded-[10px]"
                    style={{
                      background: v.related
                        ? "linear-gradient(135deg, #1B2A3F 0%, #2F4B6E 55%, #5B86B8 100%)"
                        : "linear-gradient(135deg, #2B1B4B 0%, #6B3A7A 45%, #F08A6B 100%)",
                    }}
                    aria-hidden="true"
                  >
                    {v.related ? (
                      <div className="absolute inset-x-[12%] top-[22%] space-y-1.5 font-mono text-[10px] text-white/80">
                        <div className="h-1.5 w-[70%] rounded-full bg-white/60" />
                        <div className="h-1.5 w-[48%] rounded-full bg-white/35" />
                        <div className="h-1.5 w-[58%] rounded-full bg-[#7FD1A8]/70" />
                      </div>
                    ) : (
                      <div className="absolute right-[14%] top-[18%] size-7 rounded-full bg-[#FFD9A0]/80" />
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                      <div className="h-full w-[38%] bg-[#E62117]" />
                    </div>
                  </div>
                  <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
                    <Favicon kind={v.kind} size={13} />
                    <span className="truncate">{v.title}</span>
                  </p>
                  <figcaption className="mt-2 flex-1 text-[12.5px] leading-snug text-ink-2">{v.reason}</figcaption>
                  <span
                    className={`tnum mt-2.5 w-fit rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${
                      v.related ? "bg-[#E7F5EF] text-good" : "bg-brand-soft text-brand-strong"
                    }`}
                  >
                    {v.related ? "On task" : "Drift"} · {v.pct}% sure
                  </span>
                </figure>
              ))}
            </div>
          </Tile>

          {/* Parking lot */}
          <Tile
            className="lg:col-span-4"
            title="A parking lot, not a guilt pile"
            body="Save for later closes the tab and parks the link in the popup. It's there when the session ends."
          >
            <ul className="mt-6 space-y-2">
              {[
                { kind: "youtube" as const, t: "10 hour lofi mix · beats to relax to", r: "-2deg" },
                { kind: "reddit" as const, t: "This potato looks like a duck", r: "1deg" },
                { kind: "docs" as const, t: "Weekend trip ideas", r: "-0.5deg" },
              ].map((item) => (
                <li
                  key={item.t}
                  className="flex items-center gap-2.5 rounded-[12px] border border-line bg-bg px-3 py-2.5 shadow-[0_1px_2px_rgb(26_26_26/.04)]"
                  style={{ rotate: item.r }}
                >
                  <Favicon kind={item.kind} size={15} />
                  <span className="truncate text-[13px] font-semibold text-ink">{item.t}</span>
                </li>
              ))}
            </ul>
          </Tile>

          {/* Recap */}
          <Tile
            className="lg:col-span-8"
            delay={0.05}
            title="A recap worth ending on"
            body="End a session and get a clear page: time on task, drifts caught, where the minutes went, and the last seven days of focus."
          >
            <div className="mt-6 grid flex-1 items-end gap-6 sm:grid-cols-[auto_1fr]">
              <dl className="grid grid-cols-3 gap-4 sm:grid-cols-1 sm:gap-3">
                {[
                  ["On task", "42m"],
                  ["Drifts caught", "3"],
                  ["Recovered", "3"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[12px] font-semibold text-ink-3">{k}</dt>
                    <dd className="tnum text-[22px] font-extrabold tracking-[-0.02em]">{v}</dd>
                  </div>
                ))}
              </dl>
              <WeeklyBars />
            </div>
          </Tile>

          {/* Shortcuts */}
          <Tile
            className="lg:col-span-5"
            title="Hands stay on the keyboard"
            body="Park a tab or start a session without reaching for the mouse."
          >
            <div className="mt-6">
              <ShortcutList />
            </div>
          </Tile>

          {/* Local-only */}
          <Reveal
            delay={0.05}
            className="relative overflow-hidden rounded-[24px] p-6 text-white sm:p-7 lg:col-span-7"
          >
            <div
              className="absolute inset-0 -z-10"
              style={{ background: "linear-gradient(135deg, #2A1712 0%, #1A1A1A 55%, #121110 100%)" }}
              aria-hidden="true"
            />
            <div
              className="absolute -right-20 -top-24 -z-10 size-[320px] rounded-full opacity-45 blur-[60px]"
              style={{ background: "radial-gradient(circle, #E5552E 0%, #B8202A 45%, transparent 70%)" }}
              aria-hidden="true"
            />
            <h3 className="text-[19px] font-extrabold tracking-[-0.02em]">Local by default, for real</h3>
            <p className="mt-2 max-w-[440px] text-[14.5px] leading-[1.6] text-white/70">
              Sessions, scores and saved links live in your browser&rsquo;s extension storage. There&rsquo;s no
              account to make. The only thing that ever leaves is the AI check, and only once you turn it on.
            </p>
            <div className="mt-8 flex flex-wrap gap-2 text-[13px] font-semibold">
              {["No account", "No analytics", "No keystrokes", "Skips incognito", "AI check is opt-in"].map((t) => (
                <span key={t} className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-white/85">
                  {t}
                </span>
              ))}
            </div>
            <a
              href="#privacy"
              className="mt-8 inline-flex items-center gap-1.5 text-[14px] font-bold text-white underline-offset-4 hover:underline"
            >
              Read exactly what it records
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="m5 3 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
