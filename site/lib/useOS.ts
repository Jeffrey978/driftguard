"use client";

import { useSyncExternalStore } from "react";

export type OS = "mac" | "windows" | "linux" | "chromeos" | "ios" | "android" | "unknown";
export type Browser = "chrome" | "edge" | "brave" | "opera" | "vivaldi" | "other" | "unknown";

type UAData = { platform?: string };
type NavigatorExtras = Navigator & { userAgentData?: UAData; brave?: unknown };

function detectOS(): OS {
  const nav = navigator as NavigatorExtras;
  const platform = (nav.userAgentData?.platform ?? "").toLowerCase();
  const ua = nav.userAgent.toLowerCase();

  if (platform) {
    if (platform.includes("mac")) return "mac";
    if (platform.includes("win")) return "windows";
    if (platform.includes("chrome os") || platform.includes("chromeos")) return "chromeos";
    if (platform.includes("android")) return "android";
    if (platform.includes("ios")) return "ios";
    if (platform.includes("linux")) return "linux";
  }

  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  // iPadOS reports itself as a Mac; touch points give it away.
  if (ua.includes("macintosh") && navigator.maxTouchPoints > 1) return "ios";
  if (ua.includes("android")) return "android";
  if (ua.includes("cros")) return "chromeos";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "mac";
  if (ua.includes("windows")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

function detectBrowser(): Browser {
  const nav = navigator as NavigatorExtras;
  const ua = nav.userAgent;
  if (/Edg\//.test(ua)) return "edge";
  if (/OPR\//.test(ua)) return "opera";
  if (/Vivaldi/.test(ua)) return "vivaldi";
  if (nav.brave) return "brave";
  if (/Chrome\//.test(ua)) return "chrome";
  return "other";
}

const noopSubscribe = () => () => {};

/**
 * Detected operating system. Returns "unknown" during SSR and the hydration
 * pass, then the real value — so server and client markup always match.
 */
export function useOS(): OS {
  return useSyncExternalStore(noopSubscribe, detectOS, () => "unknown");
}

export function useBrowser(): Browser {
  return useSyncExternalStore(noopSubscribe, detectBrowser, () => "unknown");
}

export function isDesktop(os: OS) {
  return os === "mac" || os === "windows" || os === "linux" || os === "chromeos";
}
