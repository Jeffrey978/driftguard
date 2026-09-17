(() => {
  if (window.top !== window) return;
  if (window.__driftguardContentLoaded) return;
  window.__driftguardContentLoaded = true;

  const ROOT_ID = "driftguard-intervention-root";
  let activePayload = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "DRIFTGUARD_SHOW_INTERVENTION") return false;

    activePayload = message.payload;
    showIntervention(message.payload);
    sendResponse({ ok: true });
    return true;
  });

  function showIntervention(payload) {
    removeExisting();

    const host = document.createElement("div");
    host.id = ROOT_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = renderMarkup(payload);
    document.documentElement.appendChild(host);

    shadow.querySelectorAll("[data-response]").forEach((button) => {
      button.addEventListener("click", () => {
        const response = button.getAttribute("data-response");
        void sendResponse(response);
      });
    });

    shadow.querySelector("[data-dismiss]")?.addEventListener("click", () => {
      void sendResponse("dismiss");
    });
  }

  async function sendResponse(response) {
    const payload = {
      ...(activePayload || {}),
      response
    };

    removeExisting();

    try {
      await chrome.runtime.sendMessage({
        type: "DRIFTGUARD_INTERVENTION_RESPONSE",
        payload
      });
    } catch (error) {
      console.warn("DriftGuard response failed", error);
    }
  }

  function removeExisting() {
    document.getElementById(ROOT_ID)?.remove();
  }

  function renderMarkup(payload) {
    const reasons = Array.isArray(payload.reasons) ? payload.reasons.slice(0, 2) : [];
    const isReminder = Boolean(payload.isReminder);
    const isBreakEnd = Boolean(payload.isBreakEnd);
    const reminderCount = Number(payload.reminderCount || 0);
    const kicker = isBreakEnd
      ? "Break's up"
      : isReminder
        ? `Drift reminder ${reminderCount}`
        : "Drift intercept";
    const title = isBreakEnd
      ? "Ready to pick it back up?"
      : isReminder
        ? "Still away from the thread?"
        : "Still part of the thread?";

    return `
      <style>
        :host {
          all: initial;
          color-scheme: light;
          --font-sans: Aptos, "Segoe UI Variable", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          --font-display: "Aptos Display", Aptos, "Segoe UI Variable Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-family: var(--font-sans);
          -webkit-font-smoothing: antialiased;
          font-feature-settings: "kern";
          text-rendering: geometricPrecision;
        }

        .dg-shell {
          position: fixed;
          z-index: 2147483647;
          top: 20px;
          right: 20px;
          width: min(408px, calc(100vw - 40px));
          box-sizing: border-box;
          background: #111d18;
          color: #fffaf0;
          border: 1px solid rgba(255, 250, 240, 0.22);
          border-radius: 8px;
          box-shadow: 0 26px 74px rgba(0, 0, 0, 0.36);
          overflow: hidden;
        }

        .dg-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(180deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
            linear-gradient(135deg, rgba(244, 189, 73, 0.2), transparent 34%, rgba(20, 123, 111, 0.32));
          background-size: 24px 24px, 24px 24px, auto;
        }

        .dg-topbar {
          position: relative;
          height: 5px;
          background: linear-gradient(90deg, #f4bd49, #e5624e, #147b6f);
        }

        .dg-body {
          position: relative;
          padding: 18px;
        }

        .dg-kicker {
          margin: 0 0 6px;
          color: #f4bd49;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .dg-title {
          margin: 0;
          max-width: 310px;
          color: #fffaf0;
          font-family: var(--font-display);
          font-size: 22px;
          line-height: 1.08;
          font-weight: 720;
        }

        .dg-intention {
          margin-top: 12px;
          padding: 12px;
          border: 1px solid rgba(255, 250, 240, 0.16);
          border-left: 5px solid #f4bd49;
          border-radius: 8px;
          background: rgba(255, 250, 240, 0.08);
          color: #fffaf0;
          font-size: 14px;
          font-weight: 560;
          line-height: 1.35;
          word-break: break-word;
        }

        .dg-meta {
          margin: 12px 0 0;
          padding: 10px 12px;
          border-radius: 8px;
          background: #fffaf0;
          color: #576962;
          font-size: 12px;
          line-height: 1.4;
        }

        .dg-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 14px;
        }

        button {
          all: unset;
          box-sizing: border-box;
          min-height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid rgba(255, 250, 240, 0.12);
          background: rgba(255, 250, 240, 0.1);
          color: #fffaf0;
          cursor: pointer;
          font-size: 12px;
          font-weight: 680;
          text-align: center;
          user-select: none;
        }

        button:hover {
          background: rgba(255, 250, 240, 0.17);
        }

        button[data-response="refocus"] {
          grid-column: 1 / -1;
          background: linear-gradient(90deg, #f4bd49, #e5624e, #147b6f);
          border-color: rgba(244, 189, 73, 0.5);
          color: #fffaf0;
          box-shadow: 0 16px 30px rgba(0, 0, 0, 0.28);
        }

        button[data-response="refocus"]:hover {
          filter: brightness(1.05);
        }

        .dg-dismiss {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 30px;
          min-height: 30px;
          padding: 0;
          border-radius: 8px;
          background: rgba(255, 250, 240, 0.1);
          color: #fffaf0;
        }
      </style>
      <section class="dg-shell" role="dialog" aria-live="polite" aria-label="DriftGuard focus check">
        <div class="dg-topbar"></div>
        <button class="dg-dismiss" data-dismiss aria-label="Dismiss">x</button>
        <div class="dg-body">
          <p class="dg-kicker">${escapeHtml(kicker)}</p>
          <h2 class="dg-title">${escapeHtml(title)}</h2>
          <div class="dg-intention">${escapeHtml(payload.intention || "Current work session")}</div>
          <p class="dg-meta">
            ${escapeHtml(payload.domain || "This page")}
            ${reasons.length ? ` - ${escapeHtml(reasons.join(" - "))}` : ""}
          </p>
          <div class="dg-actions">
            <button data-response="still_relevant">Still relevant</button>
            <button data-response="save_later">Save for later</button>
            <button data-response="break_5">Break 5m</button>
            <button data-response="break_10">Break 10m</button>
            <button data-response="refocus">Refocus me</button>
          </div>
        </div>
      </section>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
