"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MASCOT_ART, type MascotMood } from "@/lib/mascot";

type MascotProps = {
  mood: MascotMood;
  size?: number;
  /**
   * Slow 4s float + an occasional blink-ish squash on the wrapper. Off by default: the current
   * Ember SVGs animate themselves (float, blink, per-mood motion, reduced-motion aware), and
   * stacking both makes the ground shadow drift. Turn it on for static placeholder art.
   */
  idle?: boolean;
  /** Spring pop when the mood changes (on by default). */
  pop?: boolean;
  priority?: boolean;
  className?: string;
  alt?: string;
};

const SQUASH = {
  scaleY: [1, 1, 0.93, 1.04, 1],
  scaleX: [1, 1, 1.04, 0.98, 1],
};

export function Mascot({
  mood,
  size = 96,
  idle = false,
  pop = true,
  priority = false,
  className,
  alt,
}: MascotProps) {
  const reduce = useReducedMotion();
  const animateIdle = idle && !reduce;

  return (
    <motion.div
      className={className}
      style={{ width: size, height: size, position: "relative", flexShrink: 0 }}
      animate={animateIdle ? { y: [0, -size * 0.05, 0] } : { y: 0 }}
      transition={animateIdle ? { duration: 4, repeat: Infinity, ease: "easeInOut" } : undefined}
    >
      <motion.div
        style={{ width: "100%", height: "100%", transformOrigin: "50% 92%" }}
        animate={animateIdle ? SQUASH : undefined}
        transition={
          animateIdle
            ? { duration: 0.9, times: [0, 0.55, 0.7, 0.85, 1], repeat: Infinity, repeatDelay: 3.6 }
            : undefined
        }
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={mood}
            style={{ position: "absolute", inset: 0 }}
            initial={pop && !reduce ? { scale: 0.72, opacity: 0, rotate: -6 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={
              pop && !reduce
                ? { type: "spring", stiffness: 520, damping: 17, mass: 0.7 }
                : { duration: 0.16 }
            }
          >
            <Image
              src={MASCOT_ART[mood]}
              alt={alt ?? `DriftGuard mascot, ${mood}`}
              width={size}
              height={size}
              priority={priority}
              unoptimized
              draggable={false}
              style={{ width: "100%", height: "100%", userSelect: "none" }}
            />
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
