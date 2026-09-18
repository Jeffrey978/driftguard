import type { CSSProperties } from "react";
import { Wordmark } from "@/components/LogoMark";
import { DownloadButton } from "./DownloadButton";
import { ReededOrb } from "./ReededOrb";
import { WorksWith } from "./WorksWith";

const d = (i: number) => ({ "--i": i }) as CSSProperties;

export function Hero() {
  return (
    <section id="top" className="hero-backdrop relative px-4 pb-20 pt-4 sm:px-6 sm:pt-10 lg:pb-28 lg:pt-14">
      <div className="frame-ring relative z-10 mx-auto max-w-[1240px]">
        <div className="grid overflow-hidden rounded-[24px] bg-bg lg:min-h-[660px] lg:grid-cols-[55fr_45fr] max-sm:rounded-[20px]">
          {/* Left: copy */}
          <div className="relative flex min-w-0 flex-col px-5 pb-7 pt-5 sm:px-10 sm:pb-9 sm:pt-8 lg:px-14 lg:pb-10 lg:pt-10">
            <div className="rise flex items-center justify-between" style={d(0)}>
              <a href="#top" aria-label="DriftGuard home" className="rounded-lg">
                <Wordmark />
              </a>
            </div>

            <div className="flex flex-1 flex-col justify-center py-12 lg:py-10">
              <p
                className="rise inline-flex w-fit items-center gap-2.5 rounded-full border border-line bg-surface/70 py-1.5 pl-2 pr-3.5 text-[13px] font-semibold text-ink-2"
                style={d(1)}
              >
                <span className="relative flex size-4 items-center justify-center rounded-full bg-brand-soft ring-1 ring-brand/20">
                  <span className="ping absolute inset-1 rounded-full bg-brand/60" aria-hidden="true" />
                  <span className="relative size-1.5 rounded-full bg-brand" />
                </span>
                <span>
                  Free · early access<span className="max-sm:hidden"> for Chrome, Edge &amp; Brave</span>
                </span>
              </p>

              <h1
                className="display mt-6 text-[clamp(2.6rem,10.4vw,4rem)] lg:text-[clamp(3.4rem,5.1vw,4.7rem)]"
              >
                <span className="rise block text-ink" style={d(2)}>
                  Catch the drift.
                </span>
                <span className="rise block text-brand" style={d(3)}>
                  Keep the hour.
                </span>
              </h1>

              <p className="rise mt-5 max-w-[470px] text-[15px] leading-[1.6] text-ink-2" style={d(4)}>
                Tell DriftGuard what you&rsquo;re working on. When a tab pulls you off course, it asks one
                quick question instead of blocking the site. No account, local by default.
              </p>

              <div className="rise mt-8 flex flex-wrap items-center gap-3" style={d(5)}>
                <DownloadButton />
                <a
                  href="#demo"
                  className="inline-flex h-12 items-center gap-1.5 rounded-full border border-line bg-surface px-5 text-[15px] font-bold text-ink shadow-[0_1px_2px_rgb(26_26_26/.04)] transition-[transform,border-color,box-shadow] duration-150 ease-soft hover:-translate-y-px hover:border-[#d9d4cd] hover:shadow-soft active:translate-y-0 active:scale-[0.98]"
                >
                  Try the demo
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="text-ink-3">
                    <path d="m5 3 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </div>
            </div>

            <WorksWith className="rise [--i:6]" />
          </div>

          {/* Right: reeded glass over the orb */}
          <ReededOrb className="h-[300px] sm:h-[400px] lg:h-auto" />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" aria-hidden="true" />
    </section>
  );
}
