import type { Verdict } from "./types";

export const MAX_REASON = 120;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Pull the first balanced JSON object out of a model reply (handles ```json fences and chatter). */
function extractObject(text: string): string | null {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < unfenced.length; i++) {
    const ch = unfenced[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return unfenced.slice(start, i + 1);
  }
  return null;
}

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Defensive parse of the model's message content. Returns null when there is no usable verdict
 * (the route then answers 502 and the extension falls back to its rules).
 */
export function parseVerdict(content: unknown): Verdict | null {
  let text: string;
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    // Some providers return content as parts.
    text = content
      .map((p) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
      .join("");
  } else return null;

  const raw = extractObject(text);
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;

  const related = toBool(o.related);
  const confidence = toNumber(o.confidence);
  if (related === null || confidence === null) return null;

  let reason = typeof o.reason === "string" ? o.reason.replace(/\s+/g, " ").trim() : "";
  if (!reason) reason = related ? "This looks like part of your task." : "This doesn't look like part of your task.";

  return { related, confidence: clamp01(confidence), reason: truncate(reason, MAX_REASON) };
}
