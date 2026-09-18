import type { RelevanceContext, RelevancePage, RelevanceRequest } from "./types";

/** Hard limits from the endpoint contract in /AI_CHECK.md. */
export const LIMITS = {
  /** Whole request body. A max-size screenshot plus max-size text fits comfortably under this. */
  bodyBytes: 800_000,
  intention: 200,
  url: 2048,
  title: 300,
  description: 500,
  headings: 20,
  heading: 200,
  text: 4000,
  workTitle: 300,
  domain: 253,
  recentDomains: 5,
  screenshot: 700_000,
} as const;

const SCREENSHOT_PREFIXES = ["data:image/jpeg;base64,", "data:image/png;base64,"] as const;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ValidationResult =
  | { ok: true; value: RelevanceRequest }
  | { ok: false; error: string };

export function isInstallId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

class Invalid extends Error {}

function fail(message: string): never {
  throw new Invalid(message);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, field: string, max: number, { required = false, nonEmpty = false } = {}): string | undefined {
  if (v === undefined || v === null) {
    if (required) fail(`${field} is required`);
    return undefined;
  }
  if (typeof v !== "string") fail(`${field} must be a string`);
  if (v.length > max) fail(`${field} is longer than ${max} characters`);
  if (nonEmpty && !v.trim()) fail(`${field} must not be empty`);
  return v;
}

function strList(v: unknown, field: string, maxItems: number, maxEach: number): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) fail(`${field} must be an array`);
  if (v.length > maxItems) fail(`${field} has more than ${maxItems} items`);
  return v.map((item, i) => str(item, `${field}[${i}]`, maxEach, { required: true }) as string);
}

function httpUrl(v: unknown): string {
  const url = str(v, "page.url", LIMITS.url, { required: true, nonEmpty: true }) as string;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail("page.url is not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") fail("page.url must be http(s)");
  return url;
}

function screenshot(v: unknown): string | undefined {
  const s = str(v, "screenshot", LIMITS.screenshot);
  if (s === undefined) return undefined;
  const prefix = SCREENSHOT_PREFIXES.find((p) => s.startsWith(p));
  if (!prefix) fail("screenshot must be a base64 JPEG or PNG data URL");
  if (!BASE64.test(s.slice(prefix.length))) fail("screenshot is not valid base64");
  return s;
}

function page(v: unknown): RelevancePage {
  if (!isObject(v)) fail("page must be an object");
  const out: RelevancePage = {
    url: httpUrl(v.url),
    title: str(v.title, "page.title", LIMITS.title, { required: true }) as string,
  };
  const description = str(v.description, "page.description", LIMITS.description);
  const headings = strList(v.headings, "page.headings", LIMITS.headings, LIMITS.heading);
  const text = str(v.text, "page.text", LIMITS.text);
  if (description) out.description = description;
  if (headings?.length) out.headings = headings;
  if (text) out.text = text;
  return out;
}

function context(v: unknown): RelevanceContext | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isObject(v)) fail("context must be an object");
  const out: RelevanceContext = {};
  const workTitle = str(v.workTitle, "context.workTitle", LIMITS.workTitle);
  const workDomain = str(v.workDomain, "context.workDomain", LIMITS.domain);
  const recentDomains = strList(v.recentDomains, "context.recentDomains", LIMITS.recentDomains, LIMITS.domain);
  if (workTitle) out.workTitle = workTitle;
  if (workDomain) out.workDomain = workDomain;
  if (recentDomains?.length) out.recentDomains = recentDomains;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Strictly validates a parsed JSON body against the contract. Unknown keys are ignored and never
 * forwarded: the returned value is rebuilt from known fields only.
 */
export function validateRelevanceRequest(body: unknown): ValidationResult {
  try {
    if (!isObject(body)) fail("body must be a JSON object");
    const value: RelevanceRequest = {
      intention: (str(body.intention, "intention", LIMITS.intention, { required: true, nonEmpty: true }) as string).trim(),
      page: page(body.page),
    };
    const ctx = context(body.context);
    const shot = screenshot(body.screenshot);
    if (ctx) value.context = ctx;
    if (shot) value.screenshot = shot;
    return { ok: true, value };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, error: err.message };
    throw err;
  }
}
