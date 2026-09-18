"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { Mascot } from "@/components/Mascot";
import type { MascotMood } from "@/lib/mascot";

/** Per-stripe tint so the glass reads as ten separate reeds. */
const REEDS = [
  { hi: 0.15, lo: 0.05 },
  { hi: 0.2, lo: 0.08 },
  { hi: 0.12, lo: 0.04 },
  { hi: 0.18, lo: 0.09 },
  { hi: 0.14, lo: 0.06 },
  { hi: 0.1, lo: 0.1 },
  { hi: 0.17, lo: 0.05 },
  { hi: 0.13, lo: 0.08 },
  { hi: 0.19, lo: 0.06 },
  { hi: 0.12, lo: 0.07 },
];

const STORY: { mood: MascotMood; bubble: string | null; hold: number }[] = [
  { mood: "happy", bubble: null, hold: 3800 },
  { mood: "alert", bubble: "Still on “Fix the auth bug”?", hold: 3400 },
  { mood: "celebrate", bubble: "Back on it. Nice catch.", hold: 2600 },
];

export function ReededOrb({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  // Pointer parallax: -1..1 across the viewport, smoothed with a spring.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 40, damping: 18, mass: 0.8 });
  const sy = useSpring(py, { stiffness: 40, damping: 18, mass: 0.8 });
  const orbX = useTransform(sx, (v) => v * 26);
  const orbY = useTransform(sy, (v) => v * 20);
  const shadeX = useTransform(sx, (v) => v * -18);
  const shadeY = useTransform(sy, (v) => v * -14);
  const petX = useTransform(sx, (v) => v * -7);
  const petY = useTransform(sy, (v) => v * -5);

  useEffect(() => {
    if (reduce) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      px.set((e.clientX / window.innerWidth) * 2 - 1);
      py.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, px, py]);

  useEffect(() => {
    if (reduce) return;
    const t = window.setTimeout(() => setStep((s) => (s + 1) % STORY.length), STORY[step].hold);
    return () => window.clearTimeout(t);
  }, [step, reduce]);

  const beat = reduce ? STORY[0] : STORY[step];

  return (
    <div
      className={`relative isolate overflow-hidden ${className ?? ""}`}
      style={{
        background:
          "radial-gradient(120% 90% at 58% 55%, #F3C9A8 0%, #F8D9C3 45%, #FBE3D3 70%, #FCEEE5 100%)",
      }}
    >
      {/* The orb: bright orange core → crimson/maroon shading → peach falloff */}
      <motion.div
        aria-hidden="true"
        className="absolute left-1/2 top-[46%] aspect-square w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-full max-lg:w-[74%] max-sm:w-[112%]"
        style={{
          x: orbX,
          y: orbY,
          background:
            "radial-gradient(circle at 60% 34%, #FF9442 0%, #FF5A1F 18%, #F2461D 30%, #CF2A26 44%, #9E1428 56%, #8E0F24 63%, rgb(200 90 80 / .55) 70%, rgb(243 201 168 / .2) 76%, rgb(251 227 211 / 0) 80%)",
          filter: "blur(30px)",
        }}
        animate={reduce ? undefined : { scale: [1, 1.07, 0.98, 1], rotate: [0, 8, -4, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Deep maroon shade that drifts against the core */}
      <motion.div
        aria-hidden="true"
        className="absolute left-[22%] top-[44%] aspect-square w-[46%] rounded-full"
        style={{
          x: shadeX,
          y: shadeY,
          background: "radial-gradient(circle, rgb(110 8 28 / .55) 0%, rgb(142 15 36 / .25) 45%, transparent 70%)",
          filter: "blur(42px)",
        }}
        animate={reduce ? undefined : { x: [0, 30, -10, 0], y: [0, -24, 12, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Hot highlight, top right */}
      <motion.div
        aria-hidden="true"
        className="absolute left-[40%] top-[16%] aspect-square w-[34%] rounded-full"
        style={{
          background: "radial-gradient(circle, rgb(255 150 70 / .9) 0%, rgb(255 110 40 / .4) 40%, transparent 70%)",
          filter: "blur(36px)",
        }}
        animate={reduce ? undefined : { opacity: [0.75, 1, 0.8, 0.75], scale: [1, 1.12, 1, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Reeded glass */}
      <div aria-hidden="true" className="absolute inset-0 flex">
        {REEDS.map((r, i) => (
          <div key={i} className="reed" style={{ ["--hi" as string]: r.hi, ["--lo" as string]: r.lo }} />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(255 255 255 / .12) 0%, transparent 35%, transparent 70%, rgb(90 10 20 / .10) 100%)",
        }}
      />

      {/* Companion, in front of the glass */}
      <motion.div className="absolute inset-0 flex items-end justify-center pb-[7%] max-lg:pb-[4%]" style={{ x: petX, y: petY }}>
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-[55%] aspect-square w-[190%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "radial-gradient(circle, rgb(255 244 234 / .85) 0%, rgb(255 236 222 / .45) 38%, transparent 66%)", filter: "blur(10px)" }}
          />
          <AnimatePresence>
            {beat.bubble && (
              <motion.div
                key={beat.bubble}
                initial={{ opacity: 0, y: 6, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 420, damping: 26 }}
                className="absolute bottom-[96%] left-1/2 z-10 w-max max-w-[230px] -translate-x-1/2 rounded-2xl border border-white/70 bg-white/80 px-3.5 py-2 text-[13px] font-semibold text-ink shadow-[0_12px_30px_-12px_rgb(90_10_20/.45)] backdrop-blur-md"
              >
                {beat.bubble}
                <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-b border-r border-white/70 bg-white/80" />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="relative origin-bottom scale-[0.7] sm:scale-[0.8] lg:scale-100">
            <Mascot mood={beat.mood} size={180} priority alt="DriftGuard's companion" />
          </div>
          <div className="relative mx-auto -mt-3 h-3 w-24 rounded-[50%] bg-[rgb(90_10_20/.22)] blur-md max-lg:-mt-10" aria-hidden="true" />
        </div>
      </motion.div>
    </div>
  );
}
