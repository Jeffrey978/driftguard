(() => {
  if (window.top !== window) return;
  if (window.__driftguardContentLoaded) return;
  window.__driftguardContentLoaded = true;

  const FONT_FAMILY = "DriftGuard Manrope";
  const EXIT_MS = 200;

  // References live only in this isolated-world closure. The shadow root is
  // closed, so page scripts can't read the intention or reach the buttons.
  let card = null; // { host, payload }
  let lock = null; // centre-screen lock; see showLock()
  let toastHost = null;
  let toastTimer = null;
  let fontRequested = false;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "DRIFTGUARD_SHOW_INTERVENTION") {
      showCard(message.payload || {});
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "DRIFTGUARD_CLEAR_INTERVENTION") {
      const id = message.payload?.interventionId;
      if (id && card?.payload?.interventionId === id) removeCard(true);
      if (id && lock?.payload?.interventionId === id) removeLock();
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "DRIFTGUARD_TOAST") {
      showToast(message.payload || {});
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });

  // @font-face declared inside a shadow root is ignored by Chrome, so the
  // bundled Manrope is registered on the document's FontFaceSet under a
  // private family name. If the page's CSP blocks it we fall back to system-ui.
  function ensureFont(url) {
    if (fontRequested || !url || !("FontFace" in window)) return;
    fontRequested = true;
    try {
      const face = new FontFace(FONT_FAMILY, `url("${url}") format("woff2")`, {
        weight: "200 800",
        style: "normal",
        display: "swap"
      });
      document.fonts.add(face);
      face.load().catch(() => {});
    } catch {
      // Fallback fonts are fine.
    }
  }

  function createHost() {
    const host = document.createElement("driftguard-card");
    host.setAttribute(
      "style",
      "all: initial !important; position: fixed !important; z-index: 2147483647 !important; inset: auto 0 0 auto !important; display: block !important; width: 0 !important; height: 0 !important;"
    );
    const shadow = host.attachShadow({ mode: "closed" });
    return { host, shadow };
  }

  // ---------------------------------------------------------------------------
  // Prompt card
  // ---------------------------------------------------------------------------

  function showCard(payload) {
    ensureFont(payload.fontUrl);

    if (payload.kind === "drift" && payload.mode === "lock") {
      removeCard(false);
      showLock(payload);
      return;
    }

    removeLock();
    removeCard(false);

    const { host, shadow } = createHost();
    const isBreakEnd = payload.kind === "break_end";

    shadow.innerHTML = `<style>${STYLES}</style>${isBreakEnd ? breakEndMarkup(payload) : driftMarkup(payload)}`;
    (document.body || document.documentElement).appendChild(host);
    card = { host, payload };

    shadow.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        // Ignore synthetic clicks: only a real user can answer.
        if (!event.isTrusted) return;
        answer(button.getAttribute("data-action"));
      });
    });

    shadow.querySelector(".card")?.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && event.isTrusted) answer("dismiss");
    });

    const mascot = shadow.querySelector(".mascot");
    if (isBreakEnd && mascot && payload.mascotUrls?.happy) {
      // Sleepy wakes up: a small beat that says "welcome back".
      setTimeout(() => {
        if (card?.host !== host) return;
        mascot.src = payload.mascotUrls.happy;
        mascot.classList.add("pop");
      }, 900);
    }
  }

  function answer(action, source = card) {
    const current = source;
    if (!current) return;

    const payload = current.payload;
    if (current === lock) removeLock();
    else removeCard(true);

    const message =
      payload.kind === "break_end"
        ? {
            type: "DRIFTGUARD_BREAK_END_RESPONSE",
            payload: { breakEndId: payload.breakEndId, action }
          }
        : {
            type: "DRIFTGUARD_INTERVENTION_RESPONSE",
            payload: { interventionId: payload.interventionId, response: action }
          };

    try {
      chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
    } catch (error) {
      console.warn("DriftGuard response failed", error);
    }
  }

  function removeCard(animate) {
    const current = card;
    card = null;
    if (!current) return;

    if (!animate || prefersReducedMotion()) {
      current.host.remove();
      return;
    }
    current.host.dataset.leaving = "true";
    current.host.style.setProperty("opacity", "0", "important");
    current.host.style.setProperty("transition", `opacity ${EXIT_MS}ms ease`, "important");
    setTimeout(() => current.host.remove(), EXIT_MS);
  }

  function driftMarkup(payload) {
    const isReminder = Boolean(payload.isReminder);
    const title = isReminder ? "Still off track?" : "Quick check-in";
    const where = payload.domain ? `<strong>${escapeHtml(payload.domain)}</strong>` : "This page";
    const reason = payload.reason
      ? ` · ${payload.reasonSource === "ai" ? AI_TAG : ""}${escapeHtml(payload.reason)}`
      : "";

    return `
      <section class="card" role="dialog" aria-modal="false" aria-labelledby="dg-title" aria-describedby="dg-intent">
        <div class="head">
          <img class="mascot" src="${escapeAttr(payload.mascotUrl || "")}" alt="" width="52" height="52">
          <div class="copy">
            <h2 id="dg-title">${title}</h2>
            <p class="intent" id="dg-intent">You meant to <q>${escapeHtml(payload.intention || "focus")}</q></p>
          </div>
          ${closeButton("dismiss", "Dismiss this check-in")}
        </div>
        <p class="reason">${where}${reason}</p>
        <div class="actions">
          <button class="primary" data-action="refocus" type="button">Back to work</button>
          <button class="secondary" data-action="still_relevant" type="button">It's for work</button>
        </div>
        <div class="quiet" role="group" aria-label="Other options">
          <button data-action="save_later" type="button">${ICONS.bookmark}Save for later</button>
          <span aria-hidden="true" class="dot"></span>
          <button data-action="break_5" type="button">${ICONS.cup}Break 5m</button>
          <span aria-hidden="true" class="dot"></span>
          <button data-action="break_10" type="button">Break 10m</button>
        </div>
      </section>
    `;
  }

  function breakEndMarkup(payload) {
    return `
      <section class="card" role="dialog" aria-modal="false" aria-labelledby="dg-title" aria-describedby="dg-intent">
        <div class="head">
          <img class="mascot" src="${escapeAttr(payload.mascotUrl || "")}" alt="" width="52" height="52">
          <div class="copy">
            <h2 id="dg-title">Break's over</h2>
            <p class="intent" id="dg-intent">Ready to get back to <q>${escapeHtml(payload.intention || "your work")}</q>?</p>
          </div>
          ${closeButton("dismiss", "Close")}
        </div>
        <div class="actions">
          <button class="primary" data-action="return" type="button">Back to work</button>
          <button class="secondary" data-action="extend_5" type="button">5 more minutes</button>
        </div>
      </section>
    `;
  }

  function closeButton(action, label) {
    return `<button class="close" data-action="${action}" type="button" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}">${ICONS.close}</button>`;
  }

  // ---------------------------------------------------------------------------
  // Lock (centre-screen prompt for repeat drift)
  // ---------------------------------------------------------------------------
  //
  // The page is blurred, dimmed, made inert and its scroll locked until the
  // user answers. There is no close button and Escape does nothing. "Back to
  // work" is live at once; "I really need this" unlocks after a countdown.

  const MAX_REMOUNTS = 40;

  function showLock(payload) {
    // The same prompt re-sent (e.g. after a tab switch back): keep its state.
    if (lock && lock.payload.interventionId === payload.interventionId) {
      lock.payload = { ...lock.payload, ...payload, unlockAt: lock.unlockAt };
      ensureLockMounted();
      return;
    }

    removeLock();

    const unlockSeconds = Math.max(1, Number(payload.unlockSeconds) || 15);
    const unlockAt = Number(payload.unlockAt) > 0 ? Number(payload.unlockAt) : Date.now() + unlockSeconds * 1000;

    const host = document.createElement("driftguard-lock");
    host.setAttribute(
      "style",
      "all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; display: block !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important; overflow: hidden !important; pointer-events: auto !important; opacity: 1 !important; visibility: visible !important; transform: none !important; filter: none !important;"
    );
    // A manual popover sits in the top layer, above any page z-index.
    if ("showPopover" in host) host.setAttribute("popover", "manual");

    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>${STYLES}</style>${lockMarkup(payload, unlockSeconds)}`;

    lock = {
      host,
      shadow,
      payload,
      unlockAt,
      unlockSeconds,
      remounts: 0,
      saved: null,
      timer: null,
      observer: null,
      onKey: null,
      onPlay: null,
      onToggle: null
    };

    shadow.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", (event) => {
        if (!event.isTrusted || button.disabled) return;
        answer(button.getAttribute("data-action"), lock);
      });
    });

    // Backdrop clicks do nothing, on purpose. Keys pressed on the lock's own
    // buttons stay inside it, so page shortcuts (space = play) don't fire.
    shadow.querySelector(".lock-backdrop")?.addEventListener("click", (event) => event.stopPropagation());
    ["keydown", "keyup", "keypress"].forEach((type) =>
      shadow.addEventListener(type, (event) => event.stopPropagation())
    );

    freezePage();
    ensureLockMounted();
    startCountdown();

    shadow.querySelector(".primary")?.focus({ preventScroll: true });
  }

  function lockMarkup(payload, unlockSeconds) {
    const reason = payload.reason
      ? `<p class="lock-reason">${payload.reasonSource === "ai" ? AI_TAG : ""}${escapeHtml(payload.reason)}</p>`
      : "";
    const where = payload.domain ? `<p class="lock-where">On <strong>${escapeHtml(payload.domain)}</strong></p>` : "";

    return `
      <div class="lock-root">
        <div class="lock-backdrop" aria-hidden="true"></div>
        <section class="lock-card" role="alertdialog" aria-modal="true" aria-labelledby="dg-lock-title" aria-describedby="dg-lock-intent">
          <img class="lock-mascot" src="${escapeAttr(payload.mascotUrl || "")}" alt="" width="120" height="120">
          <h2 id="dg-lock-title">Let's finish what you started.</h2>
          <p class="lock-intent" id="dg-lock-intent">You meant to <q>${escapeHtml(payload.intention || "focus")}</q></p>
          ${where}
          ${reason}
          <div class="lock-actions">
            <button class="primary" data-action="refocus" type="button">Back to work</button>
            <button class="secondary unlock" data-action="still_relevant" type="button" disabled aria-describedby="dg-lock-count">
              <svg class="ring" viewBox="0 0 36 36" width="22" height="22" aria-hidden="true" focusable="false">
                <circle class="ring-track" cx="18" cy="18" r="15" />
                <circle class="ring-fill" cx="18" cy="18" r="15" pathLength="100" />
              </svg>
              <span class="unlock-label">I really need this</span>
              <span class="count" id="dg-lock-count">${unlockSeconds}s</span>
            </button>
          </div>
          <button class="end" data-action="end_session" type="button">End session</button>
        </section>
      </div>
    `;
  }

  function startCountdown() {
    const current = lock;
    if (!current) return;
    const button = current.shadow.querySelector(".unlock");
    const count = current.shadow.querySelector(".count");
    const fill = current.shadow.querySelector(".ring-fill");
    const total = current.unlockSeconds * 1000;

    const update = () => {
      if (lock !== current) return;
      const left = Math.max(0, current.unlockAt - Date.now());
      const seconds = Math.ceil(left / 1000);
      if (fill) fill.style.strokeDashoffset = String(Math.round((left / total) * 100));
      if (left <= 0) {
        clearInterval(current.timer);
        current.timer = null;
        button.disabled = false;
        button.classList.add("ready");
        count.textContent = "";
        button.setAttribute("aria-label", "I really need this page. Count it as work for this session.");
        return;
      }
      count.textContent = `${seconds}s`;
      button.setAttribute("aria-label", `I really need this. Available in ${seconds} seconds.`);
    };

    update();
    if (!button.disabled) return;
    current.timer = setInterval(update, 250);
  }

  function ensureLockMounted() {
    const current = lock;
    if (!current) return;

    if (!current.host.isConnected) {
      if (current.remounts >= MAX_REMOUNTS) return;
      current.remounts += 1;
      document.documentElement.appendChild(current.host);
    }

    if (current.host.hasAttribute("popover")) {
      try {
        if (!current.host.matches(":popover-open")) current.host.showPopover();
      } catch {
        // z-index fallback is already in place.
      }
    }

    // A page that swaps its <body> must not get its scroll or clicks back.
    freezeBody();
  }

  function freezePage() {
    const current = lock;
    const root = document.documentElement;
    current.saved = {
      overflow: root.style.getPropertyValue("overflow"),
      overflowPriority: root.style.getPropertyPriority("overflow"),
      body: null,
      bodyInert: false
    };
    root.style.setProperty("overflow", "hidden", "important");

    // Media stays paused; it is not resumed when the lock goes away.
    document.querySelectorAll("video, audio").forEach(pauseMedia);
    current.onPlay = (event) => {
      if (lock && event.target instanceof HTMLMediaElement) pauseMedia(event.target);
    };
    document.addEventListener("play", current.onPlay, true);

    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});

    current.onKey = (event) => {
      if (!lock) return;
      const inside = event.composedPath().includes(lock.host);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cycleLockFocus(event.shiftKey);
        return;
      }
      if (!inside) {
        // Keys never reach the page while it is locked.
        event.preventDefault();
        event.stopImmediatePropagation();
        lock.shadow.querySelector(".primary")?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", current.onKey, true);

    current.onToggle = (event) => {
      if (event.newState === "closed" && lock) setTimeout(ensureLockMounted, 0);
    };
    current.host.addEventListener("toggle", current.onToggle);

    current.observer = new MutationObserver(() => ensureLockMounted());
    current.observer.observe(document.documentElement, { childList: true });
  }

  function freezeBody() {
    const current = lock;
    const body = document.body;
    if (!current?.saved || !body || current.saved.body === body) return;
    if (current.saved.body) current.saved.body.inert = current.saved.bodyInert;
    current.saved.body = body;
    current.saved.bodyInert = Boolean(body.inert);
    body.inert = true;
  }

  function pauseMedia(media) {
    try {
      if (!media.paused) media.pause();
    } catch {
      // Some players guard pause(); the blur still covers them.
    }
  }

  function cycleLockFocus(backwards) {
    const buttons = Array.from(lock.shadow.querySelectorAll("button")).filter((button) => !button.disabled);
    if (!buttons.length) return;
    const index = buttons.indexOf(lock.shadow.activeElement);
    const next = backwards
      ? buttons[(index <= 0 ? buttons.length : index) - 1]
      : buttons[(index + 1) % buttons.length];
    next.focus({ preventScroll: true });
  }

  function removeLock() {
    const current = lock;
    lock = null;
    if (!current) return;

    clearInterval(current.timer);
    current.observer?.disconnect();
    if (current.onKey) window.removeEventListener("keydown", current.onKey, true);
    if (current.onPlay) document.removeEventListener("play", current.onPlay, true);
    if (current.onToggle) current.host.removeEventListener("toggle", current.onToggle);

    const saved = current.saved;
    if (saved) {
      const root = document.documentElement;
      if (saved.overflow) root.style.setProperty("overflow", saved.overflow, saved.overflowPriority);
      else root.style.removeProperty("overflow");
      if (saved.body) saved.body.inert = saved.bodyInert;
    }

    try {
      if (current.host.matches?.(":popover-open")) current.host.hidePopover();
    } catch {
      // Removing it is enough.
    }
    current.host.remove();
  }

  // ---------------------------------------------------------------------------
  // Toast (keyboard-shortcut confirmations)
  // ---------------------------------------------------------------------------

  function showToast(payload) {
    ensureFont(payload.fontUrl);
    clearTimeout(toastTimer);
    toastHost?.remove();

    const { host, shadow } = createHost();
    shadow.innerHTML = `
      <style>${STYLES}</style>
      <div class="toast" role="status" aria-live="polite">
        <img class="toast-mascot" src="${escapeAttr(payload.mascotUrl || "")}" alt="" width="28" height="28">
        <span>${escapeHtml(payload.text || "Done")}</span>
      </div>
    `;
    (document.body || document.documentElement).appendChild(host);
    toastHost = host;

    toastTimer = setTimeout(() => {
      if (toastHost !== host) return;
      host.style.setProperty("opacity", "0", "important");
      host.style.setProperty("transition", "opacity 240ms ease", "important");
      setTimeout(() => host.remove(), 260);
      toastHost = null;
    }, 2600);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  const AI_TAG = '<span class="ai-tag" title="From the AI check">AI</span>';

  const ICONS = {
    close:
      '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5.5 5.5l9 9m0-9l-9 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    bookmark:
      '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false"><path d="M6 3.5h8a1 1 0 0 1 1 1v12l-5-3.2-5 3.2v-12a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    cup:
      '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4 7h10v4.5A3.5 3.5 0 0 1 10.5 15h-3A3.5 3.5 0 0 1 4 11.5V7zm10 1h1.2a2 2 0 0 1 0 4H14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  };

  const STYLES = `
    :host {
      all: initial;
      --bg: #FFFFFF;
      --surface-2: #F1EFEC;
      --line: #E9E6E1;
      --ink: #1A1A1A;
      --ink-2: #5B5955;
      --ink-3: #9A968F;
      --brand: #E5552E;
      --brand-strong: #C8401C;
      --brand-soft: #FDEDE6;
      --focus: #E5552E;
      --shadow: 0 1px 2px rgb(26 26 26 / .06), 0 18px 48px -12px rgb(26 26 26 / .28);
      --ease: cubic-bezier(.2, .8, .2, 1);
      --spring: cubic-bezier(.34, 1.56, .64, 1);
      --scrim: rgb(26 20 16 / .42);
      --ai: #6B4FD8;
      --ai-soft: #EEEAFD;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --bg: #1C1A19;
        --surface-2: #252321;
        --line: #302D2A;
        --ink: #F4F1EC;
        --ink-2: #B4AFA8;
        --ink-3: #7C776F;
        --brand: #FF6B3D;
        --brand-strong: #FF8457;
        --brand-soft: #3A1F16;
        --shadow: 0 1px 2px rgb(0 0 0 / .4), 0 22px 56px -12px rgb(0 0 0 / .7);
        --scrim: rgb(0 0 0 / .6);
        --ai: #B3A4FF;
        --ai-soft: #2A2440;
      }
    }

    .card, .toast, .lock-root {
      position: fixed;
      right: 20px;
      bottom: 20px;
      box-sizing: border-box;
      font-family: "${FONT_FAMILY}", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.45;
      color: var(--ink);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-align: left;
      letter-spacing: 0;
      color-scheme: light;
    }

    @media (prefers-color-scheme: dark) {
      .card, .toast, .lock-root { color-scheme: dark; }
    }

    *, *::before, *::after { box-sizing: border-box; }

    .card {
      width: min(372px, calc(100vw - 32px));
      padding: 16px 16px 12px;
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: var(--shadow);
      animation: dg-in 460ms var(--spring) both;
    }

    .head {
      display: grid;
      grid-template-columns: 52px 1fr 28px;
      gap: 12px;
      align-items: start;
    }

    .mascot {
      width: 52px;
      height: 52px;
      display: block;
      object-fit: contain;
      animation: dg-wiggle 900ms 260ms var(--ease) both;
    }

    .mascot.pop { animation: dg-pop 520ms var(--spring) both; }

    .copy { min-width: 0; padding-top: 2px; }

    h2 {
      margin: 0;
      font: inherit;
      font-size: 17px;
      font-weight: 750;
      letter-spacing: -0.02em;
      line-height: 1.2;
      color: var(--ink);
    }

    .intent {
      margin: 4px 0 0;
      color: var(--ink-2);
      font-size: 13.5px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    q { quotes: "\\201C" "\\201D"; color: var(--ink); font-weight: 650; }

    .reason {
      margin: 12px 0 0;
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--surface-2);
      color: var(--ink-2);
      font-size: 12.5px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    .reason strong { color: var(--ink); font-weight: 650; }

    button {
      all: unset;
      box-sizing: border-box;
      font-family: inherit;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    button:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }

    .close {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      color: var(--ink-3);
      transition: background 160ms var(--ease), color 160ms var(--ease);
    }

    .close:hover { background: var(--surface-2); color: var(--ink); }

    .actions {
      display: grid;
      grid-template-columns: 1.25fr 1fr;
      gap: 8px;
      margin-top: 12px;
    }

    .primary, .secondary {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 14px;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 700;
      text-align: center;
      transition: transform 160ms var(--ease), background 160ms var(--ease), box-shadow 160ms var(--ease);
    }

    .primary {
      color: #FFFFFF;
      background: linear-gradient(135deg, #FF8A4C 0%, #E5552E 45%, #B8202A 100%);
      box-shadow: 0 1px 0 rgb(255 255 255 / .25) inset, 0 6px 16px -6px rgb(229 85 46 / .7);
    }

    .primary:hover { transform: translateY(-1px); box-shadow: 0 1px 0 rgb(255 255 255 / .25) inset, 0 10px 22px -8px rgb(229 85 46 / .8); }
    .primary:active { transform: translateY(0); }

    .secondary {
      color: var(--ink);
      background: var(--surface-2);
    }

    .secondary:hover { background: var(--line); }

    .quiet {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 2px 4px;
      margin-top: 8px;
    }

    .quiet button {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 8px;
      border-radius: 8px;
      color: var(--ink-2);
      font-size: 12.5px;
      font-weight: 600;
      transition: background 160ms var(--ease), color 160ms var(--ease);
    }

    .quiet button:hover { background: var(--surface-2); color: var(--ink); }
    .quiet .dot { width: 3px; height: 3px; border-radius: 50%; background: var(--line); }

    .toast {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      max-width: min(420px, calc(100vw - 32px));
      padding: 8px 16px 8px 8px;
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 999px;
      box-shadow: var(--shadow);
      font-weight: 650;
      animation: dg-in 420ms var(--spring) both;
    }

    .toast span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .ai-tag {
      display: inline-block;
      margin-right: 6px;
      padding: 0 5px;
      border-radius: 5px;
      background: var(--ai-soft);
      color: var(--ai);
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: .04em;
      line-height: 16px;
      vertical-align: 1px;
    }

    /* Lock ---------------------------------------------------------------- */

    .lock-root {
      inset: 0;
      right: 0;
      bottom: 0;
      display: grid;
      place-items: center;
      padding: 16px;
      overflow: auto;
      overscroll-behavior: contain;
    }

    .lock-backdrop {
      position: fixed;
      inset: 0;
      background: var(--scrim);
      -webkit-backdrop-filter: blur(14px) saturate(.9);
      backdrop-filter: blur(14px) saturate(.9);
      animation: dg-fade 260ms ease both;
    }

    .lock-card {
      position: relative;
      width: min(560px, 100%);
      padding: 28px 32px 20px;
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: var(--shadow);
      text-align: center;
      animation: dg-lock-in 520ms var(--spring) both;
    }

    .lock-mascot {
      width: 120px;
      height: 120px;
      display: block;
      margin: 0 auto 8px;
      object-fit: contain;
      animation: dg-wiggle 900ms 320ms var(--ease) both;
    }

    .lock-card h2 {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.025em;
      line-height: 1.15;
      text-wrap: balance;
    }

    .lock-intent {
      margin: 10px 0 0;
      color: var(--ink-2);
      font-size: 16px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .lock-where {
      margin: 6px 0 0;
      color: var(--ink-3);
      font-size: 13px;
    }

    .lock-where strong { color: var(--ink-2); font-weight: 650; }

    .lock-reason {
      margin: 14px auto 0;
      max-width: 44ch;
      padding: 10px 14px;
      border-radius: 14px;
      background: var(--surface-2);
      color: var(--ink-2);
      font-size: 14px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .lock-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 22px;
    }

    .lock-actions .primary, .lock-actions .secondary {
      min-height: 48px;
      font-size: 15px;
      gap: 8px;
    }

    .unlock[disabled] {
      cursor: not-allowed;
      color: var(--ink-3);
    }

    .unlock .count {
      font-variant-numeric: tabular-nums;
      font-weight: 750;
      color: var(--ink-2);
    }

    .unlock .count:empty { display: none; }

    .ring { flex: none; transform: rotate(-90deg); }
    .ring circle { fill: none; stroke-width: 3.5; }
    .ring-track { stroke: var(--line); }
    .ring-fill {
      stroke: var(--brand);
      stroke-linecap: round;
      stroke-dasharray: 100;
      stroke-dashoffset: 100;
      transition: stroke-dashoffset 250ms linear;
    }
    .unlock.ready .ring { display: none; }

    .end {
      display: inline-block;
      margin-top: 14px;
      padding: 6px 10px;
      border-radius: 8px;
      color: var(--ink-3);
      font-size: 13px;
      font-weight: 600;
      transition: color 160ms var(--ease), background 160ms var(--ease);
    }

    .end:hover { color: var(--ink); background: var(--surface-2); }

    @keyframes dg-lock-in {
      from { opacity: 0; transform: translateY(18px) scale(.96); }
      to { opacity: 1; transform: none; }
    }

    @media (max-width: 520px) {
      .lock-card { padding: 22px 18px 16px; border-radius: 24px; }
      .lock-card h2 { font-size: 22px; }
      .lock-mascot { width: 96px; height: 96px; }
      .lock-actions { grid-template-columns: 1fr; }
    }
    .toast-mascot { width: 28px; height: 28px; display: block; flex: none; object-fit: contain; }

    @keyframes dg-in {
      from { opacity: 0; transform: translateY(14px) scale(.96); }
      to { opacity: 1; transform: none; }
    }

    @keyframes dg-wiggle {
      0% { transform: rotate(0); }
      30% { transform: rotate(-8deg) translateY(-2px); }
      60% { transform: rotate(6deg); }
      100% { transform: rotate(0); }
    }

    @keyframes dg-pop {
      0% { transform: scale(.8); }
      100% { transform: scale(1); }
    }

    @media (prefers-reduced-motion: reduce) {
      .card, .toast, .lock-card, .lock-backdrop { animation: dg-fade 200ms ease both; }
      .mascot, .mascot.pop, .lock-mascot { animation: none; }
      .ring-fill { transition: none; }
      .primary:hover { transform: none; }
    }

    @keyframes dg-fade { from { opacity: 0; } to { opacity: 1; } }

    @media (max-width: 420px) {
      .card, .toast { right: 16px; bottom: 16px; }
    }
  `;
})();
