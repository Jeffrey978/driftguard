"use client";

import { DOWNLOAD_URL } from "@/lib/site";
import { useOS, type OS } from "@/lib/useOS";

const OS_NAME: Partial<Record<OS, string>> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
  chromeos: "ChromeOS",
};

type DownloadButtonProps = {
  className?: string;
  size?: "md" | "lg";
};

export function downloadLabel(os: OS): string {
  const name = OS_NAME[os];
  return name ? `Download for ${name} — it's free` : "Download — it's free";
}

export function DownloadButton({ className, size = "lg" }: DownloadButtonProps) {
  const os = useOS();
  const onPhone = os === "ios" || os === "android";
  const pad = size === "lg" ? "h-12 px-6 text-[15px]" : "h-11 px-5 text-[14px]";

  return (
    <a
      href={onPhone ? "#install" : DOWNLOAD_URL}
      download={onPhone ? undefined : "driftguard-extension.zip"}
      className={`group relative inline-flex items-center justify-center gap-2 rounded-full font-bold text-white transition-[transform,box-shadow,filter] duration-150 ease-soft hover:-translate-y-px hover:brightness-[1.04] active:translate-y-0 active:scale-[0.98] ${pad} ${className ?? ""}`}
      style={{
        background: "linear-gradient(180deg, #F26A40 0%, #E5552E 52%, #D4461F 100%)",
        boxShadow:
          "inset 0 1px 0 rgb(255 255 255 / .38), inset 0 -1px 0 rgb(120 20 10 / .18), 0 1px 2px rgb(184 32 42 / .25), 0 10px 22px -10px rgb(229 85 46 / .75)",
      }}
    >
      {onPhone ? (
        <span>Free for desktop — see how</span>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="-ml-0.5">
            <path
              d="M8 2.5v7.5m0 0L4.8 6.8M8 10l3.2-3.2M3 13h10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{downloadLabel(os)}</span>
        </>
      )}
    </a>
  );
}
