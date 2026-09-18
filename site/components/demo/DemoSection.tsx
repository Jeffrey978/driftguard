import { Reveal } from "@/components/Reveal";
import { Demo } from "./Demo";

export function DemoSection() {
  return (
    <section id="demo" className="scroll-mt-6 px-4 pb-24 pt-4 sm:px-6 lg:pb-32">
      <div className="mx-auto max-w-[1180px]">
        <Reveal className="grid gap-4 pb-10 lg:grid-cols-[1.1fr_1fr] lg:items-end lg:gap-16">
          <h2 className="display text-[clamp(2.1rem,5vw,3.4rem)]">
            Go on. <span className="text-brand">Get distracted.</span>
          </h2>
          <p className="max-w-[460px] text-[15.5px] leading-[1.6] text-ink-2">
            This is the whole loop, running in your browser. Set an intention, start a session, then click a tab
            you shouldn&rsquo;t. DriftGuard waits a beat, then asks. Every answer is one click.
          </p>
        </Reveal>
        <Reveal delay={0.05}>
          <Demo />
        </Reveal>
      </div>
    </section>
  );
}
