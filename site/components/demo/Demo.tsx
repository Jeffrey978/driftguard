"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Mascot } from "@/components/Mascot";
import { LogoMark } from "@/components/LogoMark";
import type { MascotMood } from "@/lib/mascot";
import { isMac, shortcutLabel } from "@/lib/shortcuts";
import { useOS } from "@/lib/useOS";
import { FakePage, Favicon } from "./FakePages";
import {
  DRIFT_TABS,
  INTENTION_CHIPS,
  PRESETS,
  aiVerdictFor,
  fmtClock,
  workTabFor,
  type DemoTab,
  type PresetId,
} from "./model";

type Phase = "setup" | "focus" | "drifting" | "prompt" | "lock" | "break" | "recap";
type Parked = { id: string; title: string; domain: string; kind: DemoTab["kind"] };
type Toast = { id: number; text: string };

const EASE = [0.2, 0.8, 0.2, 1] as const;
const BREAK_SECONDS = 300;
/** The demo break runs at 20× so nobody waits five real minutes. */
const BREAK_STEP = 5;
const BREAK_TICK_MS = 250;
/** How long the fake AI check "reads" the page before answering. */
const SCAN_MS = 1700;
/** The real lock waits 15 s before "I really need this" unlocks; the demo waits 5. */
const UNLOCK_SECONDS_DEMO = 5;
const UNLOCK_SECONDS_REAL = 15;

export function Demo() {
  const os = useOS();
  const mac = os === "unknown" ? true : isMac(os);

  const [intention, setIntention] = useState<string>(INTENTION_CHIPS[0]);
  const [preset, setPreset] = useState<PresetId>("25");
  const [phase, setPhase] = useState<Phase>("setup");
  const [activeId, setActiveId] = useState<DemoTab["id"]>("work");
  const [closed, setClosed] = useState<DemoTab["id"][]>([]);
  const [trusted, setTrusted] = useState<string[]>([]);
  const [parked, setParked] = useState<Parked[]>([]);
  const [caught, setCaught] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [breakLeft, setBreakLeft] = useState(BREAK_SECONDS);
  const [toast, setToast] = useState<Toast | null>(null);
  const [flash, setFlash] = useState<MascotMood | null>(null);
  /** Lock mode kicks in when you drift again after a break (see AI_CHECK.md). */
  const [hadBreak, setHadBreak] = useState(false);
  const [unlockLeft, setUnlockLeft] = useState(UNLOCK_SECONDS_DEMO);

  const promptTimer = useRef<number | null>(null);
  const toastSeq = useRef(0);

  const workTab = workTabFor(intention);
  const tabs = [workTab, ...DRIFT_TABS].filter((t) => !closed.includes(t.id));
  const active = tabs.find((t) => t.id === activeId) ?? workTab;
  const minutes = PRESETS.find((p) => p.id === preset)?.minutes ?? 25;
  const running = phase !== "setup" && phase !== "recap";
  const breakOver = phase === "break" && breakLeft <= 0;
  const remaining = minutes ? minutes * 60 - elapsed : elapsed;
  const shortIntention = intention.trim() || "your task";
  const verdict = aiVerdictFor(active, workTab, shortIntention);
  const locked = phase === "lock";

  // Session clock: real time.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // Break clock: fast-forwarded.
  const breakTicking = phase === "break" && !breakOver;
  useEffect(() => {
    if (!breakTicking) return;
    const id = window.setInterval(
      () => setBreakLeft((b) => Math.max(0, b - BREAK_STEP)),
      BREAK_TICK_MS,
    );
    return () => window.clearInterval(id);
  }, [breakTicking]);

  // Lock countdown: "I really need this" unlocks when it hits zero.
  const unlockTicking = locked && unlockLeft > 0;
  useEffect(() => {
    if (!unlockTicking) return;
    const id = window.setInterval(() => setUnlockLeft((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearInterval(id);
  }, [unlockTicking]);

  // Toasts and mascot flashes clear themselves.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(id);
  }, [flash]);

  useEffect(
    () => () => {
      if (promptTimer.current) window.clearTimeout(promptTimer.current);
    },
    [],
  );

  const say = (text: string) => {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text });
  };

  const cancelPrompt = () => {
    if (promptTimer.current) window.clearTimeout(promptTimer.current);
    promptTimer.current = null;
  };

  const start = () => {
    if (!intention.trim()) return;
    setElapsed(0);
    setPhase("focus");
    setFlash("happy");
    say(minutes ? `Session started · ${minutes} minutes` : "Open session started");
  };

  const openTab = (tab: DemoTab) => {
    if (tab.id === activeId) return;
    setActiveId(tab.id);
    cancelPrompt();

    const inSession = phase === "focus" || phase === "drifting" || phase === "prompt" || phase === "lock";
    if (!inSession) return; // setup, break and recap: just switch tabs
    if (!tab.drift || trusted.includes(tab.domain)) {
      setPhase("focus");
      return;
    }

    // The AI check reads the page, then either the corner prompt or, after a break, the lock.
    setPhase("drifting");
    setToast(null);
    promptTimer.current = window.setTimeout(() => {
      if (hadBreak) setUnlockLeft(UNLOCK_SECONDS_DEMO);
      setPhase(hadBreak ? "lock" : "prompt");
      setToast(null);
      promptTimer.current = null;
    }, SCAN_MS);
  };

  const backToWork = () => {
    const wasPrompt = phase === "prompt" || phase === "lock";
    setActiveId("work");
    setPhase("focus");
    setBreakLeft(BREAK_SECONDS);
    setFlash("celebrate");
    if (wasPrompt) {
      setCaught((c) => c + 1);
      say(`Back on “${shortIntention}”. Drift caught.`);
    } else {
      say(`Welcome back. Still on “${shortIntention}”.`);
    }
  };

  const itsForWork = () => {
    setTrusted((t) => (t.includes(active.domain) ? t : [...t, active.domain]));
    setPhase("focus");
    setFlash("thinking");
    say(`Got it. ${active.domain} is fine for this session.`);
  };

  const saveForLater = () => {
    const tab = active;
    setParked((p) => [{ id: `${tab.id}-${p.length}`, title: tab.title, domain: tab.domain, kind: tab.kind }, ...p]);
    setClosed((c) => [...c, tab.id]);
    setActiveId("work");
    setPhase("focus");
    setCaught((c) => c + 1);
    setFlash("happy");
    say("Parked for later. Tab closed.");
  };

  const takeBreak = () => {
    setBreakLeft(BREAK_SECONDS);
    setHadBreak(true);
    setPhase("break");
  };

  const reallyNeedThis = () => {
    if (unlockLeft > 0) return;
    setTrusted((t) => (t.includes(active.domain) ? t : [...t, active.domain]));
    setPhase("focus");
    setFlash("thinking");
    say(`Unlocked. ${active.domain} counts as work this session.`);
  };

  const endSession = () => {
    cancelPrompt();
    setToast(null);
    setPhase("recap");
  };

  const reset = () => {
    cancelPrompt();
    setPhase("setup");
    setActiveId("work");
    setClosed([]);
    setTrusted([]);
    setParked([]);
    setCaught(0);
    setElapsed(0);
    setBreakLeft(BREAK_SECONDS);
    setToast(null);
    setFlash(null);
    setHadBreak(false);
    setUnlockLeft(UNLOCK_SECONDS_DEMO);
  };

  const baseMood: MascotMood =
    phase === "setup"
      ? "idle"
      : phase === "drifting"
        ? "thinking"
        : phase === "prompt" || phase === "lock" || breakOver
          ? "alert"
          : phase === "break"
            ? "sleepy"
            : phase === "recap"
              ? "celebrate"
              : "happy";
  const mood = flash ?? baseMood;

  const badge =
    phase === "break" ? "zz" : running ? `${Math.max(0, Math.ceil(remaining / 60))}m` : null;

  const driftTabsLeft = tabs.filter((t) => t.drift && !trusted.includes(t.domain));
  const hint =
    phase === "setup"
      ? "Pick an intention, then press Start."
      : phase === "drifting"
        ? "The AI check is reading the page…"
        : phase === "prompt"
          ? hadBreak
            ? "There it is. Pick any answer — none of them scold you."
            : "There it is. Pick any answer. Try Break 5m, then drift again to see lock mode."
          : phase === "lock"
            ? "Drifted again after a break, so it asks from the centre. No close button, on purpose."
            : phase === "break"
            ? breakOver
              ? "Break's over. It asks once, then leaves it to you."
              : "On a break. Demo time runs 20× faster."
            : phase === "recap"
              ? "That's the loop. Replay it, or install the real thing below."
              : driftTabsLeft.length
                ? `${hadBreak ? "Break done. Now drift again" : "Now wander off"}: click the ${driftTabsLeft[0].id === "youtube" ? "YouTube" : "Reddit"} tab.`
                : "No distractions left. End the session to see the recap.";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-5">
      {/* ── Browser ─────────────────────────────────────────────── */}
      <div className="order-2 min-w-0 lg:order-1">
        <div className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-lift">
          {/* Tab strip */}
          <div className="flex items-end gap-1 bg-[#ECE9E5] pl-3 pr-1 pt-2">
            {mac && (
              <div className="mb-3 mr-2 flex shrink-0 gap-1.5" aria-hidden="true">
                <span className="size-3 rounded-full bg-[#FF5F57]" />
                <span className="size-3 rounded-full bg-[#FEBC2E]" />
                <span className="size-3 rounded-full bg-[#28C840]" />
              </div>
            )}
            <LayoutGroup>
              <div className="flex min-w-0 flex-1 items-end gap-0.5" role="tablist" aria-label="Demo browser tabs">
                <AnimatePresence initial={false}>
                  {tabs.map((tab) => {
                    const isActive = tab.id === active.id;
                    const nudge = phase === "focus" && driftTabsLeft[0]?.id === tab.id && !isActive;
                    return (
                      <motion.button
                        layout
                        key={tab.id}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => openTab(tab)}
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0, transition: { duration: 0.22, ease: EASE } }}
                        transition={{ duration: 0.28, ease: EASE }}
                        className={`group relative flex h-9 min-w-0 max-w-[230px] items-center gap-2 overflow-hidden rounded-t-[10px] px-3 text-left text-[12.5px] font-semibold transition-colors ${
                          isActive
                            ? "flex-1 basis-0 bg-surface text-ink"
                            : "text-ink-2 hover:bg-white/50 max-sm:flex-none max-sm:px-2.5 sm:flex-1 sm:basis-0"
                        }`}
                      >
                        <span className="shrink-0">
                          <Favicon kind={tab.kind} size={14} />
                        </span>
                        <span className={`truncate ${isActive ? "" : "max-sm:sr-only"}`}>{tab.title}</span>
                        {trusted.includes(tab.domain) && (
                          <svg viewBox="0 0 12 12" className="size-3 shrink-0 text-good" aria-label="Trusted this session">
                            <path d="m2.5 6.2 2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {nudge && (
                          <span className="absolute right-2 top-1.5 flex size-2" aria-hidden="true">
                            <span className="ping absolute inset-0 rounded-full bg-brand" />
                            <span className="relative size-2 rounded-full bg-brand" />
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            </LayoutGroup>
            {!mac && (
              <div className="mb-2.5 ml-1 flex shrink-0 items-center text-ink-2" aria-hidden="true">
                <svg viewBox="0 0 30 16" className="h-4 w-[30px]"><path d="M10 8h10" stroke="currentColor" strokeWidth="1" /></svg>
                <svg viewBox="0 0 30 16" className="h-4 w-[30px]"><rect x="10.5" y="3.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
                <svg viewBox="0 0 30 16" className="h-4 w-[30px]"><path d="m10.5 3.5 9 9m0-9-9 9" stroke="currentColor" strokeWidth="1" /></svg>
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
            <div className="flex shrink-0 gap-2.5 pr-1 text-ink-3 max-sm:hidden" aria-hidden="true">
              <svg viewBox="0 0 16 16" className="size-4"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <svg viewBox="0 0 16 16" className="size-4 opacity-50"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-2 px-3 text-[12.5px] text-ink-2">
              <svg viewBox="0 0 12 12" className="size-3 shrink-0 text-ink-3" aria-hidden="true"><rect x="2.5" y="5.5" width="7" height="5" rx="1.2" fill="currentColor" /><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
              <span className="truncate">{active.url}</span>
            </div>
            <div className="relative flex size-8 shrink-0 items-center justify-center rounded-full" title="DriftGuard">
              <LogoMark size={20} />
              <AnimatePresence>
                {badge && (
                  <motion.span
                    key="badge"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 24 }}
                    className={`tnum absolute -bottom-0.5 -right-1 rounded-[5px] px-1 text-[9.5px] font-extrabold leading-[14px] text-white ${
                      phase === "break" ? "bg-warn" : "bg-brand"
                    }`}
                  >
                    {badge}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Viewport */}
          <div className="relative h-[380px] overflow-hidden sm:h-[420px]">
            <div
              className={`absolute inset-0 transition-[filter,transform] duration-[420ms] ease-soft ${
                locked ? "scale-[1.03] blur-[7px] saturate-[.8]" : ""
              }`}
              aria-hidden={locked || undefined}
              inert={locked || undefined}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={active.id + active.kind}
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <FakePage tab={active} intention={shortIntention} />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* AI check: a quick scan over the page before the verdict lands */}
            <AnimatePresence>
              {phase === "drifting" && (
                <motion.div
                  key="scan"
                  className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.2 }}
                  aria-hidden="true"
                >
                  <div className="absolute inset-0 bg-[rgb(247_246_244/.28)]" />
                  <div className="scan-sweep absolute inset-x-0 top-0 h-28">
                    <div className="h-full bg-gradient-to-b from-transparent via-[rgb(255_138_76/.16)] to-[rgb(229_85_46/.22)]" />
                    <div className="h-[2px] bg-[linear-gradient(90deg,transparent,#E5552E_20%,#B8202A_80%,transparent)] shadow-[0_0_12px_rgb(229_85_46/.6)]" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {phase === "drifting" && (
                <motion.div
                  key="scan-pill"
                  role="status"
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, transition: { duration: 0.16 } }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface py-1 pl-1 pr-3.5 text-[12.5px] font-bold text-ink shadow-lift sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:translate-x-0"
                >
                  <Mascot mood="thinking" size={28} pop={false} />
                  AI check
                  <span className="font-semibold text-ink-3">reading the page</span>
                  <span className="flex gap-0.5" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="scan-dot size-1 rounded-full bg-brand" style={{ animationDelay: `${i * 140}ms` }} />
                    ))}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* The in-page DriftGuard card */}
            <AnimatePresence>
              {(phase === "prompt" || phase === "break") && (
                <motion.div
                  key="overlay"
                  role="dialog"
                  aria-label="DriftGuard"
                  initial={{ opacity: 0, x: 40, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 30, transition: { duration: 0.2, ease: EASE } }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="absolute inset-x-3 bottom-3 z-10 rounded-[16px] border border-line bg-surface p-4 shadow-[0_2px_4px_rgb(26_26_26/.06),0_24px_48px_-16px_rgb(26_26_26/.35)] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-[320px]"
                >
                  {phase === "prompt" ? (
                    <PromptCard
                      intention={shortIntention}
                      reason={verdict.reason}
                      confidence={verdict.confidence}
                      onBack={backToWork}
                      onForWork={itsForWork}
                      onSave={saveForLater}
                      onBreak={takeBreak}
                    />
                  ) : (
                    <BreakCard
                      over={breakOver}
                      left={breakLeft}
                      intention={shortIntention}
                      onBack={backToWork}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Lock mode: drifted again after a break */}
            <AnimatePresence>
              {locked && (
                <motion.div
                  key="lock"
                  className="absolute inset-0 z-20 flex items-center justify-center bg-[rgb(26_26_26/.42)] p-3 sm:p-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.22 } }}
                  transition={{ duration: 0.28 }}
                >
                  <LockCard
                    intention={shortIntention}
                    reason={verdict.reason}
                    left={unlockLeft}
                    onBack={backToWork}
                    onNeed={reallyNeedThis}
                    onEnd={endSession}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recap */}
            <AnimatePresence>
              {phase === "recap" && (
                <motion.div
                  key="recap"
                  className="absolute inset-0 z-20 flex items-center justify-center bg-[rgb(247_246_244/.86)] p-4 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    initial={{ y: 16, scale: 0.97 }}
                    animate={{ y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 24 }}
                    className="w-full max-w-[420px] rounded-[20px] border border-line bg-surface p-5 text-center shadow-lift sm:p-6"
                  >
                    <div className="mx-auto w-fit">
                      <Mascot mood="celebrate" size={72} />
                    </div>
                    <p className="display mt-2 text-[24px]">Session complete</p>
                    <p className="mt-1 truncate text-[13px] text-ink-2">“{shortIntention}”</p>
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-left">
                      {[
                        ["Focused", fmtClock(elapsed)],
                        ["Drifts caught", String(caught)],
                        ["Parked", String(parked.length)],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-[10px] bg-surface-2 px-3 py-2.5">
                          <dt className="text-[11px] font-semibold text-ink-3">{k}</dt>
                          <dd className="tnum text-[20px] font-extrabold tracking-tight">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 text-[12.5px] text-ink-2">+1 day on your streak. See you tomorrow.</p>
                    <button
                      onClick={reset}
                      className="mt-4 inline-flex h-10 items-center rounded-full bg-ink px-5 text-[13px] font-bold text-white transition-transform duration-150 hover:-translate-y-px active:scale-[0.98]"
                    >
                      Replay the demo
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Toast */}
            <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-3 sm:bottom-4 sm:top-auto" aria-live="polite">
              <AnimatePresence>
                {toast && (
                  <motion.p
                    key={toast.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6, transition: { duration: 0.16 } }}
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                    className="max-w-full truncate rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-white shadow-lift"
                  >
                    {toast.text}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 px-1 text-[13px] font-semibold text-ink-2" aria-live="polite">
          <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          {hint}
        </p>
      </div>

      {/* ── Popup / companion rail ──────────────────────────────── */}
      <aside
        className="order-1 flex flex-col rounded-[20px] border border-line bg-surface p-4 shadow-soft sm:p-5 lg:order-2"
        aria-label="DriftGuard popup"
      >
        <div className="flex items-center gap-3">
          <Mascot mood={mood} size={52} />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-ink-3">DriftGuard</p>
            <p className="truncate text-[15px] font-bold text-ink">
              {phase === "setup"
                ? "What are you working on?"
                : phase === "recap"
                  ? "Nice session."
                  : phase === "break"
                    ? breakOver
                      ? "Ready when you are."
                      : "Resting. You too."
                    : phase === "prompt"
                      ? "Tap, tap."
                      : phase === "lock"
                        ? "Let’s get back."
                        : phase === "drifting"
                          ? "Reading the page…"
                          : "On it with you."}
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {phase === "setup" ? (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: EASE }}
            >
              <label htmlFor="demo-intention" className="sr-only">
                Your intention
              </label>
              <input
                id="demo-intention"
                value={intention}
                maxLength={48}
                onChange={(e) => setIntention(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && start()}
                placeholder="e.g. Fix the auth bug"
                className="mt-4 h-11 w-full rounded-[10px] border border-line bg-surface-2 px-3 text-[14px] font-semibold text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-brand focus:bg-surface"
              />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {INTENTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setIntention(chip)}
                    className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                      intention === chip
                        ? "border-brand/30 bg-brand-soft text-brand-strong"
                        : "border-line text-ink-2 hover:border-[#d9d4cd] hover:text-ink"
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-[12px] font-semibold text-ink-3">Focus for</p>
              <div className="mt-1.5 grid grid-cols-4 gap-1 rounded-[12px] bg-surface-2 p-1" role="radiogroup" aria-label="Session length">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    role="radio"
                    aria-checked={preset === p.id}
                    onClick={() => setPreset(p.id)}
                    className="relative h-8 rounded-[9px] text-[12.5px] font-bold text-ink-2"
                  >
                    {preset === p.id && (
                      <motion.span
                        layoutId="preset-pill"
                        className="absolute inset-0 rounded-[9px] bg-surface shadow-[0_1px_2px_rgb(26_26_26/.1)]"
                        transition={{ type: "spring", stiffness: 500, damping: 36 }}
                      />
                    )}
                    <span className={`relative ${preset === p.id ? "text-ink" : ""}`}>{p.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={start}
                disabled={!intention.trim()}
                className="mt-4 h-11 w-full rounded-full bg-brand text-[14px] font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/.3),0_8px_18px_-10px_rgb(229_85_46/.9)] transition-[transform,background-color] duration-150 hover:bg-brand-strong active:scale-[0.98] disabled:opacity-50"
              >
                Start focus
              </button>
              <p className="mt-2.5 text-center text-[11.5px] text-ink-3">
                or press <span className="font-bold text-ink-2">{shortcutLabel(os, "F")}</span> in the real thing
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="running"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: EASE }}
            >
              <div className="mt-4 rounded-[12px] bg-surface-2 p-3">
                <p className="text-[11.5px] font-semibold text-ink-3">Working on</p>
                <p className="truncate text-[14px] font-bold text-ink">{shortIntention}</p>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="tnum text-[26px] font-extrabold tracking-[-0.03em]">
                    {fmtClock(Math.max(0, remaining))}
                  </span>
                  <span className="text-[11.5px] font-semibold text-ink-3">{minutes ? "left" : "elapsed"}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E4E0DA]">
                  <div
                    className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                    style={{
                      width: minutes ? `${Math.min(100, (elapsed / (minutes * 60)) * 100)}%` : "100%",
                      background: "var(--brand-gradient)",
                      opacity: minutes ? 1 : 0.25,
                    }}
                  />
                </div>
              </div>

              <div className="mt-3 flex gap-2 text-[12px] font-semibold text-ink-2">
                <span className="rounded-full bg-brand-soft px-2.5 py-1 text-brand-strong">
                  <span className="tnum">{caught}</span> caught
                </span>
                {trusted.length > 0 && (
                  <span className="rounded-full bg-[#E7F5EF] px-2.5 py-1 text-good">{trusted.length} trusted</span>
                )}
              </div>

              <p className="mt-4 text-[12px] font-semibold text-ink-3">Parking lot</p>
              <ul className="mt-1.5 space-y-1.5">
                <AnimatePresence initial={false}>
                  {parked.map((item) => (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: -14, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 420, damping: 26 }}
                      className="flex items-center gap-2 rounded-[10px] border border-line px-2.5 py-2"
                    >
                      <Favicon kind={item.kind} size={14} />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">{item.title}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {parked.length === 0 && (
                  <li className="rounded-[10px] border border-dashed border-line px-2.5 py-2 text-[12px] text-ink-3">
                    Links you save for later land here.
                  </li>
                )}
              </ul>

              <button
                onClick={phase === "recap" ? reset : endSession}
                className="mt-4 h-10 w-full rounded-full border border-line text-[13px] font-bold text-ink transition-[transform,border-color] duration-150 hover:border-[#d9d4cd] active:scale-[0.98]"
              >
                {phase === "recap" ? "Start over" : "End session"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-auto hidden border-t border-line pt-4 text-[12px] text-ink-3 lg:block">
          <p className="font-semibold">Shortcuts in the real extension</p>
          <ul className="mt-2 space-y-1.5">
            {[
              ["Open DriftGuard", "D"],
              ["Save tab for later", "S"],
              ["Start / end focus", "F"],
            ].map(([label, key]) => (
              <li key={key} className="flex justify-between gap-2">
                <span>{label}</span>
                <span className="font-bold text-ink-2">{shortcutLabel(os, key)}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function AiChip({ confidence, tone = "light" }: { confidence: number; tone?: "light" | "dark" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        tone === "light" ? "bg-brand-soft text-brand-strong" : "bg-white/10 text-white/85"
      }`}
    >
      <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
        <path d="M6 1.2 7.1 4.9 10.8 6 7.1 7.1 6 10.8 4.9 7.1 1.2 6 4.9 4.9Z" fill="currentColor" />
      </svg>
      AI check <span className="tnum font-semibold opacity-75">· {Math.round(confidence * 100)}% sure</span>
    </span>
  );
}

function PromptCard({
  intention,
  reason,
  confidence,
  onBack,
  onForWork,
  onSave,
  onBreak,
}: {
  intention: string;
  reason: string;
  confidence: number;
  onBack: () => void;
  onForWork: () => void;
  onSave: () => void;
  onBreak: () => void;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <Mascot mood="alert" size={44} idle={false} />
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold leading-tight tracking-[-0.01em] text-ink">Still part of the plan?</p>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-2">
            {reason} You set out to <span className="font-bold text-ink">{intention}</span>.
          </p>
          <div className="mt-2">
            <AiChip confidence={confidence} />
          </div>
        </div>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <button
          onClick={onBack}
          className="h-10 rounded-full bg-brand text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/.3)] transition-[transform,background-color] duration-150 hover:bg-brand-strong active:scale-[0.97]"
        >
          Back to work
        </button>
        <button
          onClick={onForWork}
          className="h-10 rounded-full border border-line text-[13px] font-bold text-ink transition-[transform,border-color] duration-150 hover:border-[#d9d4cd] active:scale-[0.97]"
        >
          It&rsquo;s for work
        </button>
      </div>
      <div className="mt-2.5 flex items-center justify-center gap-4 text-[12px] font-semibold text-ink-2">
        <button onClick={onSave} className="rounded underline-offset-4 hover:text-ink hover:underline">
          Save for later
        </button>
        <span className="size-1 rounded-full bg-line" aria-hidden="true" />
        <button onClick={onBreak} className="rounded underline-offset-4 hover:text-ink hover:underline">
          Break 5m
        </button>
      </div>
    </div>
  );
}

function BreakCard({
  over,
  left,
  intention,
  onBack,
}: {
  over: boolean;
  left: number;
  intention: string;
  onBack: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <Mascot mood={over ? "alert" : "sleepy"} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold leading-tight text-ink">
            {over ? "Break’s over." : "On a break"}
          </p>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-2">
            {over ? `Ready to get back to “${intention}”?` : "No prompts until it ends."}
          </p>
        </div>
        {!over && <span className="tnum text-[22px] font-extrabold tracking-tight text-warn">{fmtClock(left)}</span>}
      </div>
      {!over && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-warn transition-[width] duration-200 ease-linear"
            style={{ width: `${(left / BREAK_SECONDS) * 100}%` }}
          />
        </div>
      )}
      <button
        onClick={onBack}
        className={`mt-3.5 h-10 w-full rounded-full text-[13px] font-bold transition-[transform,background-color] duration-150 active:scale-[0.97] ${
          over ? "bg-brand text-white hover:bg-brand-strong" : "border border-line text-ink hover:border-[#d9d4cd]"
        }`}
      >
        {over ? "Back to work" : "I’m back early"}
      </button>
    </div>
  );
}

function LockCard({
  intention,
  reason,
  left,
  onBack,
  onNeed,
  onEnd,
}: {
  intention: string;
  reason: string;
  left: number;
  onBack: () => void;
  onNeed: () => void;
  onEnd: () => void;
}) {
  const waiting = left > 0;
  return (
    <motion.div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="demo-lock-title"
      aria-describedby="demo-lock-reason"
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className="w-full max-w-[540px] rounded-[24px] border border-line bg-surface p-4 shadow-[0_2px_4px_rgb(26_26_26/.08),0_40px_80px_-30px_rgb(26_26_26/.55)] sm:p-7 sm:text-center"
    >
      <div className="flex items-center gap-3 sm:flex-col sm:gap-1">
        <Mascot mood="alert" size={52} className="sm:size-[76px]!" />
        <p id="demo-lock-title" className="display text-[21px] leading-[1.1] sm:mt-1 sm:text-[28px]">
          Let&rsquo;s finish what you started.
        </p>
      </div>
      <p className="mt-2.5 truncate text-[13px] text-ink-2 sm:mt-3 sm:text-[14px]">
        You set out to <span className="font-bold text-ink">{intention}</span>.
      </p>
      <p id="demo-lock-reason" className="mt-1 text-[13px] leading-snug text-ink-2 sm:text-[14px]">
        {reason}
      </p>
      <div className="mt-4 grid gap-2 sm:mx-auto sm:mt-5 sm:max-w-[400px] sm:grid-cols-2">
        <button
          onClick={onBack}
          className="h-10 rounded-full bg-brand text-[13.5px] font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/.3),0_8px_18px_-10px_rgb(229_85_46/.9)] transition-[transform,background-color] duration-150 hover:bg-brand-strong active:scale-[0.97] sm:h-11"
        >
          Back to work
        </button>
        <button
          onClick={onNeed}
          disabled={waiting}
          aria-describedby="demo-lock-note"
          className="relative h-10 overflow-hidden rounded-full border border-line text-[13.5px] font-bold text-ink transition-[transform,border-color,color] duration-150 enabled:hover:border-[#d9d4cd] enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:text-ink-3 sm:h-11"
        >
          {waiting && (
            <span
              className="absolute inset-y-0 left-0 bg-surface-2 transition-[width] duration-1000 ease-linear"
              style={{ width: `${(left / UNLOCK_SECONDS_DEMO) * 100}%` }}
              aria-hidden="true"
            />
          )}
          <span className="relative">
            I really need this
            {waiting && <span className="tnum"> · {left}s</span>}
          </span>
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:mt-4 sm:justify-center">
        <button onClick={onEnd} className="rounded text-[12.5px] font-semibold text-ink-3 underline-offset-4 hover:text-ink hover:underline">
          End session
        </button>
        <span className="size-1 rounded-full bg-line max-sm:hidden" aria-hidden="true" />
        <span id="demo-lock-note" className="text-[11.5px] text-ink-3">
          Demo waits {UNLOCK_SECONDS_DEMO}s. The real one waits {UNLOCK_SECONDS_REAL}s.
        </span>
      </div>
    </motion.div>
  );
}
