/**
 * Best-effort, in-memory sliding-window rate limiter.
 *
 * IMPORTANT: state lives in this process only. On Vercel (serverless / Fluid compute) every
 * function instance has its own copy, instances are recycled, and a burst can fan out across
 * several instances, so the effective limit is "N per window per instance". Treat this as a
 * speed bump against a single misbehaving install, not as abuse protection. The real limit is a
 * Vercel Firewall rate-limit rule on /api/relevance (see DEPLOY.md).
 */

export type Window = { limit: number; windowMs: number };
export type LimitResult = { ok: true } | { ok: false; retryAfter: number };

export class SlidingWindowLimiter {
  private readonly windows: Window[];
  private readonly longest: number;
  private readonly maxKeys: number;
  private readonly hits = new Map<string, number[]>();

  constructor(windows: Window[], maxKeys = 10_000) {
    if (!windows.length) throw new Error("at least one window");
    this.windows = windows;
    this.longest = Math.max(...windows.map((w) => w.windowMs));
    this.maxKeys = maxKeys;
  }

  /** Counts a hit for `key` if every window has room; otherwise returns seconds until it would. */
  hit(key: string, now = Date.now()): LimitResult {
    const stamps = (this.hits.get(key) ?? []).filter((t) => now - t < this.longest);

    let retryMs = 0;
    for (const { limit, windowMs } of this.windows) {
      const inWindow = stamps.filter((t) => now - t < windowMs);
      if (inWindow.length >= limit) {
        // The window frees a slot when its oldest counted hit ages out.
        const oldest = inWindow[inWindow.length - limit];
        retryMs = Math.max(retryMs, oldest + windowMs - now);
      }
    }

    if (retryMs > 0) {
      this.store(key, stamps);
      return { ok: false, retryAfter: Math.max(1, Math.ceil(retryMs / 1000)) };
    }

    stamps.push(now);
    this.store(key, stamps);
    return { ok: true };
  }

  get size(): number {
    return this.hits.size;
  }

  private store(key: string, stamps: number[]) {
    // Re-insert so Map order tracks recency; evict the stalest key when full.
    this.hits.delete(key);
    if (!stamps.length) return;
    this.hits.set(key, stamps);
    while (this.hits.size > this.maxKeys) {
      const stalest = this.hits.keys().next().value;
      if (stalest === undefined) break;
      this.hits.delete(stalest);
    }
  }
}
