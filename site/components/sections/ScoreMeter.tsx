"use client";

import { motion } from "motion/react";

export function ScoreMeter({ score, threshold }: { score: number; threshold: number }) {
  const asks = score >= threshold;
  return (
    <div className="relative">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full origin-left rounded-full"
          style={{
            width: `${Math.max(score, 2)}%`,
            background: asks ? "var(--brand-gradient)" : "linear-gradient(90deg, #9fd8bf, #1f9d6b)",
          }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: "0px 0px -15% 0px" }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
        />
      </div>
      <div
        className="absolute -top-1 h-[18px] w-0.5 rounded-full bg-ink"
        style={{ left: `${threshold}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
