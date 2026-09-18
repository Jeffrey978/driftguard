"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Mascot } from "@/components/Mascot";
import { MASCOT_ART, MASCOT_CAPTIONS, MASCOT_MOODS, type MascotMood } from "@/lib/mascot";

export function MascotShowcase() {
  const [mood, setMood] = useState<MascotMood>("happy");
  const caption = MASCOT_CAPTIONS[mood];

  return (
    <section className="px-4 py-24 sm:px-6 lg:py-32" aria-labelledby="mascot-title">
      <div className="mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <h2 id="mascot-title" className="display text-[clamp(2.1rem,4.6vw,3.3rem)]">
            It has a face, <span className="text-brand">so the nudge doesn&rsquo;t feel like a scold.</span>
          </h2>
          <p className="mt-4 max-w-[460px] text-[15.5px] leading-[1.6] text-ink-2">
            The same little character sits in the popup, the prompt and the recap. Its mood tells you where you
            stand before you read a word. Hover or tap a mood to see it.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3" role="group" aria-label="Mascot moods">
            {MASCOT_MOODS.map((m) => {
              const active = m === mood;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onMouseEnter={() => setMood(m)}
                  onFocus={() => setMood(m)}
                  onClick={() => setMood(m)}
                  className={`group flex flex-col items-center gap-1.5 rounded-[16px] border px-2 py-3 transition-[background-color,border-color,box-shadow] duration-[160ms] ease-soft ${
                    active
                      ? "border-brand/40 bg-brand-soft shadow-soft"
                      : "border-line bg-surface hover:border-ink-3/40"
                  }`}
                >
                  <Image
                    src={MASCOT_ART[m]}
                    alt=""
                    width={44}
                    height={44}
                    unoptimized
                    className="size-11 transition-transform duration-[160ms] ease-soft group-hover:-translate-y-0.5"
                  />
                  <span className={`text-[12.5px] font-bold capitalize ${active ? "text-brand-strong" : "text-ink-2"}`}>
                    {MASCOT_CAPTIONS[m].label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative flex min-h-[380px] flex-col items-center justify-center overflow-hidden rounded-[28px] border border-line bg-surface px-6 py-12 shadow-soft sm:min-h-[440px]">
          <div
            className="pointer-events-none absolute left-1/2 top-[44%] size-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80 blur-[40px]"
            style={{ background: "radial-gradient(circle, #FFE3D3 0%, #FDEDE6 45%, transparent 70%)" }}
            aria-hidden="true"
          />
          <Mascot mood={mood} size={200} className="relative" alt={`DriftGuard mascot, ${caption.label}`} />
          <div className="relative mt-8 h-[64px] text-center" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mood}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <p className="text-[20px] font-extrabold tracking-[-0.02em] text-ink">{caption.label}</p>
                <p className="mt-1 text-[14.5px] text-ink-2">{caption.when}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
