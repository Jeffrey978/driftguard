type LogoMarkProps = { size?: number; className?: string };

/** DriftGuard mark: an orange ring with the "you are here" dot, echoing the toolbar icon. */
export function LogoMark({ size = 28, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="dg-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF8A4C" />
          <stop offset=".45" stopColor="#E5552E" />
          <stop offset="1" stopColor="#B8202A" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="url(#dg-mark)" strokeWidth="5" />
      <circle cx="16" cy="16" r="3.2" fill="#1A1A1A" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark />
      <span className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">DriftGuard</span>
    </span>
  );
}
