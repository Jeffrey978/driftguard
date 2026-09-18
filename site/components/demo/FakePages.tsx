import type { DemoTab } from "./model";

function Bar({ w, tone = "bg-[#ECEAE6]", h = "h-2.5" }: { w: string; tone?: string; h?: string }) {
  return <div className={`${h} rounded-full ${tone}`} style={{ width: w }} />;
}

export function Favicon({ kind, size = 16 }: { kind: DemoTab["kind"]; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": true } as const;
  switch (kind) {
    case "youtube":
      return (
        <svg {...common}>
          <rect x="1" y="3" width="14" height="10" rx="3" fill="#E62117" />
          <path d="M6.5 5.8v4.4L10.3 8z" fill="#fff" />
        </svg>
      );
    case "reddit":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill="#FF4500" />
          <ellipse cx="8" cy="9.2" rx="4" ry="2.6" fill="#fff" />
          <circle cx="6.5" cy="9" r=".8" fill="#FF4500" />
          <circle cx="9.5" cy="9" r=".8" fill="#FF4500" />
        </svg>
      );
    case "github":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill="#1A1A1A" />
          <path d="M5.5 11.5v-1.8c0-.9.4-1.4 1-1.7-1.6-.2-2.6-.8-2.6-2.4 0-.6.2-1.1.6-1.5 0-.5 0-1 .2-1.3.6 0 1.1.3 1.5.6a5 5 0 0 1 3.6 0c.4-.3.9-.6 1.5-.6.2.3.2.8.2 1.3.4.4.6.9.6 1.5 0 1.6-1 2.2-2.6 2.4.6.3 1 .8 1 1.7v1.8" fill="none" stroke="#fff" strokeWidth="1.1" />
        </svg>
      );
    case "course":
      return (
        <svg {...common}>
          <rect x="1" y="1" width="14" height="14" rx="4" fill="#2A73CC" />
          <path d="M10.6 6.2A3 3 0 1 0 10.6 9.8" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M3.5 1.5h6l3 3v10h-9z" fill="#2F7DF6" />
          <path d="M5.5 8h5M5.5 10h5M5.5 12h3" stroke="#fff" strokeWidth="1" />
        </svg>
      );
  }
}

export function FakePage({ tab, intention }: { tab: DemoTab; intention: string }) {
  switch (tab.kind) {
    case "youtube":
      return (
        <div className="flex h-full gap-4 bg-white p-4 max-sm:flex-col sm:p-5">
          <div className="min-w-0 flex-1">
            <div
              className="relative aspect-video w-full overflow-hidden rounded-xl"
              style={{ background: "linear-gradient(135deg, #2B1B4B 0%, #6B3A7A 45%, #F08A6B 100%)" }}
            >
              <div className="absolute bottom-[18%] left-[12%] h-[34%] w-[22%] rounded-t-full bg-[#1d1233]/70" />
              <div className="absolute bottom-[18%] left-[30%] h-[22%] w-[34%] rounded-md bg-[#1d1233]/80" />
              <div className="absolute right-[14%] top-[16%] size-10 rounded-full bg-[#FFD9A0]/80 blur-[1px]" />
              <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                <div className="h-full w-[38%] bg-[#E62117]" />
              </div>
            </div>
            <p className="mt-3 truncate text-[14px] font-bold text-ink">{tab.title}</p>
            <p className="mt-1 text-[12px] text-ink-3">Chillhop Café · 4.1M views</p>
          </div>
          <div className="hidden w-[34%] shrink-0 flex-col gap-3 md:flex">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-2">
                <div className="aspect-video w-[46%] shrink-0 rounded-lg bg-[#EFEDEA]" />
                <div className="flex flex-1 flex-col gap-1.5 pt-1">
                  <Bar w="90%" h="h-2" />
                  <Bar w="60%" h="h-2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case "reddit":
      return (
        <div className="h-full bg-[#F4F5F6] p-4 sm:p-5">
          <div className="rounded-xl bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/.06)]">
            <p className="text-[11px] font-semibold text-ink-3">r/mildlyinteresting · 5h</p>
            <p className="mt-1 text-[15px] font-bold text-ink">This potato looks like a duck</p>
            <div className="mt-3 flex h-[150px] items-center justify-center rounded-lg bg-[#F1E7D6] sm:h-[190px]">
              <div className="h-16 w-24 rounded-[50%] bg-[#C9A36B]" />
            </div>
            <p className="mt-3 text-[12px] font-semibold text-ink-3">24.1k upvotes · 812 comments</p>
          </div>
          <div className="mt-3 space-y-2 rounded-xl bg-white p-4 max-sm:hidden">
            <Bar w="70%" />
            <Bar w="45%" />
          </div>
        </div>
      );
    case "github":
      return (
        <div className="h-full bg-white p-4 font-mono text-[12px] sm:p-5">
          <p className="font-sans text-[15px] font-bold text-ink">
            fix: OAuth callback drops <span className="rounded bg-[#EFF1F3] px-1">state</span> param{" "}
            <span className="font-medium text-ink-3">#212</span>
          </p>
          <p className="mt-1 font-sans text-[12px] text-ink-3">
            <span className="rounded-full bg-[#1F9D6B] px-2 py-0.5 font-bold text-white">Open</span> 3 files changed
          </p>
          <div className="mt-4 overflow-hidden rounded-lg border border-[#E4E6EA]">
            <div className="border-b border-[#E4E6EA] bg-[#F6F8FA] px-3 py-1.5 text-ink-2">src/auth/callback.ts</div>
            <div className="space-y-px py-1 leading-[1.7]">
              <div className="px-3 text-ink-2">{"  const url = new URL(req.url);"}</div>
              <div className="bg-[#FFEBE9] px-3 text-[#82071E]">{"- const code = url.searchParams.get(\"code\");"}</div>
              <div className="bg-[#E6FFEC] px-3 text-[#116329]">{"+ const { code, state } = parse(url);"}</div>
              <div className="bg-[#E6FFEC] px-3 text-[#116329]">{"+ if (!verify(state)) return reject(401);"}</div>
              <div className="px-3 text-ink-2">{"  return exchange(code);"}</div>
            </div>
          </div>
        </div>
      );
    case "course":
      return (
        <div className="flex h-full gap-4 bg-white p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold text-[#2A73CC]">Biology 101 · Week 4</p>
            <p className="mt-1 text-[16px] font-bold text-ink">Chapter 4: Cell structure</p>
            <div className="mt-3 aspect-video max-h-[150px] w-full rounded-xl bg-[linear-gradient(135deg,#E3EEFB,#CFE0F7)]" />
            <div className="mt-3 space-y-2">
              <Bar w="92%" />
              <Bar w="80%" />
            </div>
          </div>
          <div className="hidden w-[30%] space-y-2 rounded-xl bg-[#F6F8FB] p-3 md:block">
            <Bar w="70%" tone="bg-[#DCE6F3]" />
            <Bar w="90%" tone="bg-[#DCE6F3]" />
            <Bar w="55%" tone="bg-[#DCE6F3]" />
          </div>
        </div>
      );
    default:
      return (
        <div className="h-full bg-[#F4F4F2] p-4 sm:p-6">
          <div className="mx-auto h-full max-w-[560px] rounded-t-lg bg-white px-6 pt-6 shadow-[0_1px_3px_rgb(0_0_0/.08)] sm:px-10">
            <p className="text-[18px] font-bold text-ink">{tab.domain === "notion.so" ? intention : tab.title}</p>
            <div className="mt-4 space-y-2.5">
              <p className="text-[13px] leading-relaxed text-ink-2">
                {tab.domain === "notion.so"
                  ? "Next step: the smallest thing that moves this forward."
                  : "Hi friends — after four months of building, DriftGuard is ready for you to try."}
              </p>
              <Bar w="94%" />
              <Bar w="88%" />
              <Bar w="62%" />
            </div>
          </div>
        </div>
      );
  }
}
