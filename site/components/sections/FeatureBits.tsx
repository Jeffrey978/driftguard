"use client";

import { motion } from "motion/react";
import { Kbd } from "@/components/Kbd";
import { SHORTCUTS, isMac, shortcutKeys } from "@/lib/shortcuts";
import { useOS } from "@/lib/useOS";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const VIEW = { once: true, margin: "0px 0px -15% 0px" } as const;

export function TimerRing() {
  const r = 70;
  const c = 2 * Math.PI * r;
  const progress = 0.64; // 16 of 25 minutes gone
  return (
    <div className="relative size-[180px] sm:size-[200px]">
      <svg viewBox="0 0 170 170" className="size-full -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF8A4C" />
            <stop offset=".45" stopColor="#E5552E" />
            <stop offset="1" stopColor="#B8202A" />
          </linearGradient>
        </defs>
        <circle cx="85" cy="85" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        <motion.circle
          cx="85"
          cy="85"
          r={r}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c * (1 - progress) }}
          viewport={VIEW}
          transition={{ duration: 1.4, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum display text-[40px] leading-none">9:12</span>
        <span className="mt-1 text-[12px] font-semibold text-ink-3">of 25 minutes left</span>
      </div>
    </div>
  );
}

// The recap shows the last seven days, ending today.
const WEEK = [
  { d: "Fri", m: 95 },
  { d: "Sat", m: 25 },
  { d: "Sun", m: 50 },
  { d: "Mon", m: 130 },
  { d: "Tue", m: 70 },
  { d: "Wed", m: 110 },
  { d: "Today", m: 100 },
];

export function WeeklyBars() {
  const max = Math.max(...WEEK.map((w) => w.m));
  return (
    <div className="flex h-[150px] items-end gap-2 sm:gap-3" role="img" aria-label="Focused minutes for each of the last seven days, highest on Monday">
      {WEEK.map((w, i) => {
        const today = w.d === "Today";
        return (
          <div key={w.d} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <motion.div
              className="w-full origin-bottom rounded-[8px]"
              style={{
                height: `${(w.m / max) * 100}%`,
                background: today ? "var(--brand-gradient)" : "#EDE6DF",
              }}
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={VIEW}
              transition={{ duration: 0.7, ease: EASE, delay: 0.1 + i * 0.06 }}
            />
            <span className={`text-[11.5px] font-semibold ${today ? "text-ink" : "text-ink-3"}`}>{w.d}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ShortcutList({ tone = "light" }: { tone?: "light" | "dark" }) {
  const os = useOS();
  return (
    <div>
      <ul className="divide-y divide-line">
        {SHORTCUTS.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <span className="text-[14px] font-semibold text-ink">{s.action}</span>
            <Kbd keys={shortcutKeys(os, s.key)} tone={tone} size="sm" />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[12.5px] text-ink-3">
        {os === "unknown" ? "Shown for Windows and Linux." : isMac(os) ? "Shown for macOS." : "Shown for Windows and Linux."}{" "}
        Rebind them at <span className="font-semibold text-ink-2">chrome://extensions/shortcuts</span>.
      </p>
    </div>
  );
}
