"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { DownloadButton } from "@/components/hero/DownloadButton";
import { Kbd } from "@/components/Kbd";
import { shortcutKeys } from "@/lib/shortcuts";
import { useBrowser, useOS, type Browser, type OS } from "@/lib/useOS";

type Platform = "mac" | "windows";

const EXT_URL: Record<Browser, string> = {
  chrome: "chrome://extensions",
  edge: "edge://extensions",
  brave: "brave://extensions",
  opera: "opera://extensions",
  vivaldi: "vivaldi://extensions",
  other: "chrome://extensions",
  unknown: "chrome://extensions",
};

function platformFor(os: OS): Platform | null {
  if (os === "mac") return "mac";
  if (os === "windows" || os === "linux" || os === "chromeos") return "windows";
  return null;
}

function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard can be blocked; the URL is visible to copy by hand */
    }
  }
  return (
    <span className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface-2 py-1 pl-3.5 pr-1">
      <code className="truncate font-sans text-[13.5px] font-bold text-ink">{url}</code>
      <button
        type="button"
        onClick={copy}
        className="relative ml-1 inline-flex h-8 min-w-[74px] items-center justify-center gap-1.5 rounded-full bg-ink px-3 text-[12.5px] font-bold text-white transition-[background-color,scale] duration-[160ms] ease-soft hover:bg-[#333] active:scale-[0.97]"
      >
        {copied ? "Copied" : "Copy"}
        <span className="sr-only" aria-live="polite">
          {copied ? `${url} copied to clipboard` : ""}
        </span>
      </button>
    </span>
  );
}

function Step({ n, title, children }: { n: number; title: ReactNode; children?: ReactNode }) {
  return (
    <li className="group relative flex gap-4 pb-7 last:pb-0">
      <span className="absolute left-[15px] top-9 bottom-1 w-px bg-line group-last:hidden" aria-hidden="true" />
      <span className="tnum relative flex size-[31px] shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[13px] font-extrabold text-ink shadow-soft">
        {n}
      </span>
      <div className="min-w-0 pt-1">
        <p className="text-[15.5px] font-bold leading-[1.45] text-ink">{title}</p>
        {children ? <div className="mt-1 text-[14px] leading-[1.6] text-ink-2">{children}</div> : null}
      </div>
    </li>
  );
}

export function Install() {
  const os = useOS();
  const browser = useBrowser();
  const detected = platformFor(os);
  const [picked, setPicked] = useState<Platform | null>(null);
  const tab: Platform = picked ?? detected ?? "mac";
  const url = EXT_URL[browser];
  const onPhone = os === "ios" || os === "android";

  const keys = shortcutKeys(tab === "mac" ? "mac" : "windows", "D");

  return (
    <section id="install" className="scroll-mt-6 px-4 py-24 sm:px-6 lg:py-32" aria-labelledby="install-title">
      <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-10 lg:self-start">
          <h2 id="install-title" className="display text-[clamp(2.1rem,4.6vw,3.3rem)]">
            Install it in <span className="text-brand">about a minute.</span>
          </h2>
          <p className="mt-4 max-w-[440px] text-[15.5px] leading-[1.6] text-ink-2">
            DriftGuard isn&rsquo;t in the Chrome Web Store yet, so you load it yourself as an unpacked extension.
            It&rsquo;s the same thing developers do every day, and you can remove it in one click.
          </p>
          {onPhone ? (
            <p className="mt-5 rounded-[14px] border border-line bg-brand-soft px-4 py-3 text-[14px] font-semibold text-ink">
              Browser extensions need a desktop browser. Open this page on your Mac or PC to install.
            </p>
          ) : null}
          <div className="mt-8 rounded-[16px] border border-line bg-surface p-5 text-[13.5px] leading-[1.6] text-ink-2 shadow-soft">
            <p className="font-bold text-ink">Works in any Chromium browser</p>
            <p className="mt-1.5">
              <b className="text-ink">Edge</b>: edge://extensions, Developer mode is in the left sidebar.{" "}
              <b className="text-ink">Brave</b>: brave://extensions. <b className="text-ink">Arc</b>: open
              chrome://extensions in a new tab. <b className="text-ink">Opera</b> and{" "}
              <b className="text-ink">Vivaldi</b> use opera:// and vivaldi://extensions. Firefox and Safari
              aren&rsquo;t supported.
            </p>
          </div>
        </div>

        <div className="rounded-[28px] border border-line bg-surface p-5 shadow-lift sm:p-8">
          <div
            role="tablist"
            aria-label="Your computer"
            className="relative inline-flex rounded-full bg-surface-2 p-1"
          >
            {(["mac", "windows"] as const).map((p) => {
              const active = tab === p;
              return (
                <button
                  key={p}
                  role="tab"
                  type="button"
                  id={`install-tab-${p}`}
                  aria-selected={active}
                  aria-controls="install-panel"
                  onClick={() => setPicked(p)}
                  className={`relative h-10 rounded-full px-5 text-[14px] font-bold transition-colors duration-[160ms] ${
                    active ? "text-ink" : "text-ink-3 hover:text-ink-2"
                  }`}
                >
                  {active ? (
                    <motion.span
                      layoutId="install-pill"
                      className="absolute inset-0 rounded-full bg-surface shadow-soft"
                      transition={{ type: "spring", stiffness: 480, damping: 36 }}
                    />
                  ) : null}
                  <span className="relative">{p === "mac" ? "macOS" : "Windows & Linux"}</span>
                </button>
              );
            })}
          </div>
          {detected ? (
            <p className="mt-3 text-[12.5px] font-semibold text-ink-3">
              Picked for you based on your computer.
            </p>
          ) : null}

          <ol
            id="install-panel"
            role="tabpanel"
            aria-labelledby={`install-tab-${tab}`}
            className="mt-7"
          >
            {tab === "mac" ? (
              <>
                <Step n={1} title="Download the extension.">
                  {onPhone ? (
                    <>On your computer, open this page and use the download button.</>
                  ) : (
                    <div className="mt-3">
                      <DownloadButton size="md" />
                    </div>
                  )}
                </Step>
                <Step n={2} title="Open your Downloads folder and double-click the zip.">
                  Finder unzips it into a folder called DriftGuard. Move it somewhere you&rsquo;ll keep it, like
                  Documents. The browser loads it from there.
                </Step>
                <Step n={3} title="Open the extensions page.">
                  Browsers don&rsquo;t let websites link to it, so copy this and paste it into the address bar:
                  <br />
                  <CopyUrl url={url} />
                </Step>
                <Step n={4} title="Switch on Developer mode, top right." />
                <Step n={5} title="Click Load unpacked and choose the DriftGuard folder.">
                  Pick the folder itself, the one with manifest.json inside, not the zip.
                </Step>
                <Step n={6} title="Pin it so the timer stays in view.">
                  Click the puzzle-piece icon in the toolbar, then the pin next to DriftGuard. Open it any time
                  with <Kbd keys={keys} size="sm" />.
                </Step>
              </>
            ) : (
              <>
                <Step n={1} title="Download the extension.">
                  {onPhone ? (
                    <>On your computer, open this page and use the download button.</>
                  ) : (
                    <div className="mt-3">
                      <DownloadButton size="md" />
                    </div>
                  )}
                </Step>
                <Step n={2} title="Right-click the zip and choose Extract All.">
                  Your browser can&rsquo;t load it from inside the zip. Extract it somewhere you&rsquo;ll keep it,
                  like Documents.
                </Step>
                <Step n={3} title="Open the extensions page.">
                  Browsers don&rsquo;t let websites link to it, so copy this and paste it into the address bar:
                  <br />
                  <CopyUrl url={url} />
                </Step>
                <Step n={4} title="Switch on Developer mode.">
                  Top right in Chrome and Brave. In Edge it&rsquo;s in the left sidebar.
                </Step>
                <Step n={5} title="Click Load unpacked and choose the DriftGuard folder.">
                  Open the extracted folder and pick the DriftGuard folder inside, the one with manifest.json
                  in it.
                </Step>
                <Step n={6} title="Pin it so the timer stays in view.">
                  Click the puzzle-piece icon in the toolbar, then the pin next to DriftGuard. Open it any time
                  with <Kbd keys={keys} size="sm" />.
                </Step>
              </>
            )}
          </ol>
        </div>
      </div>
    </section>
  );
}
