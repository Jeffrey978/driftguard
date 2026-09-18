export const DOWNLOAD_URL = "/downloads/driftguard-extension.zip";

export const SITE_NAME = "DriftGuard";

export const SITE_DESCRIPTION =
  "A local-first focus companion for Chrome, Edge and Brave. Tell it what you're working on; when a tab pulls you away, it asks one quick question instead of blocking the site. No account, local by default.";

export function siteUrl(): URL {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return new URL(host ? `https://${host}` : "http://localhost:3000");
}
