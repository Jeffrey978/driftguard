import type { ReactNode } from "react";

/** Generic glyphs, deliberately not the browsers' real logos. */
const Glyph = {
  ring: (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10" cy="10" r="3" fill="currentColor" />
    </svg>
  ),
  wave: (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
      <path d="M3 12.5c2-5 6.5-7.5 10.5-5.5 2.2 1.1 3 3.3 2 5-1.2 2-4.5 2.2-6 .6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
      <path d="M10 2.5 16 5v4.6c0 3.7-2.5 6.5-6 7.9-3.5-1.4-6-4.2-6-7.9V5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ),
  arc: (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
      <path d="M3.5 16 10 3.5 16.5 16M6 12.5c3-1.6 5.5-1.6 8 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  oval: (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
      <ellipse cx="10" cy="10" rx="5" ry="7.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  ),
  vee: (
    <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m6.8 7.2 3.2 6 3.2-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
} satisfies Record<string, ReactNode>;

const BROWSERS: { name: string; glyph: ReactNode }[] = [
  { name: "Chrome", glyph: Glyph.ring },
  { name: "Edge", glyph: Glyph.wave },
  { name: "Brave", glyph: Glyph.shield },
  { name: "Arc", glyph: Glyph.arc },
  { name: "Opera", glyph: Glyph.oval },
  { name: "Vivaldi", glyph: Glyph.vee },
];

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="flex shrink-0 items-center gap-9 pr-9" aria-hidden={hidden || undefined}>
      {BROWSERS.map((b) => (
        <li key={b.name} className="flex items-center gap-2 text-[15px] font-bold tracking-[-0.01em] text-ink-3">
          {b.glyph}
          {b.name}
        </li>
      ))}
    </ul>
  );
}

export function WorksWith({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="mb-3 text-[12px] font-semibold text-ink-3">Works with</p>
      <div className="fade-edges max-w-[460px] overflow-hidden">
        <div className="marquee-track flex w-max">
          <Row />
          <Row hidden />
        </div>
      </div>
      <p className="sr-only">Works with Chrome, Edge, Brave, Arc, Opera and Vivaldi.</p>
    </div>
  );
}
