import { Wordmark } from "@/components/LogoMark";
import { Mascot } from "@/components/Mascot";
import { DownloadButton } from "@/components/hero/DownloadButton";

export function Footer() {
  return (
    <footer className="px-4 pb-10 sm:px-6">
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-col items-center gap-6 rounded-[32px] border border-line bg-surface px-6 py-14 text-center shadow-soft sm:py-16">
          <Mascot mood="happy" size={88} />
          <h2 className="display max-w-[780px] text-[clamp(2rem,4.4vw,3rem)]">
            The next hour is yours. <span className="text-brand">Keep it.</span>
          </h2>
          <DownloadButton />
          <p className="text-[13px] font-semibold text-ink-3">Free. No account. Local by default.</p>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-5 text-[13.5px] text-ink-3 sm:flex-row">
          <Wordmark />
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2 font-semibold">
            <a href="#demo" className="hover:text-ink">Demo</a>
            <a href="#privacy" className="hover:text-ink">Privacy</a>
            <a href="#install" className="hover:text-ink">Install</a>
            <a href="#top" className="hover:text-ink">Back to top</a>
          </nav>
          <p>© {new Date().getFullYear()} DriftGuard</p>
        </div>
      </div>
    </footer>
  );
}
