type KbdProps = { keys: string[]; size?: "sm" | "md"; tone?: "light" | "dark" };

export function Kbd({ keys, size = "md", tone = "light" }: KbdProps) {
  const pad = size === "sm" ? "h-6 min-w-6 px-1.5 text-[12px]" : "h-8 min-w-8 px-2 text-[13px]";
  const look =
    tone === "light"
      ? "border-line bg-surface text-ink shadow-[inset_0_-2px_0_var(--line)]"
      : "border-white/15 bg-white/10 text-white shadow-[inset_0_-2px_0_rgb(255_255_255/0.12)]";
  return (
    <span className="inline-flex items-center gap-1" aria-label={keys.join(" + ")}>
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className={`inline-flex items-center justify-center rounded-md border font-sans font-bold ${pad} ${look}`}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
