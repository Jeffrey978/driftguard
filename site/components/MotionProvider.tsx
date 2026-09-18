"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** "user" = follow prefers-reduced-motion: transforms are skipped, opacity still animates. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
