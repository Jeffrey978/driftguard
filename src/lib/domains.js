// Pure domain helpers. No chrome.* here, so node tests can import this file.

// Each category is a set of rules. A domain matches a rule only when it is the
// domain itself or one of its subdomains, never a substring. The few brands
// that live on rotating domains (pirate streaming mirrors, self-hosted Jira)
// are matched on whole hostname labels instead.
//
// Categories are checked in this order; the first match wins. Keep specific
// work surfaces (docs.google.com, aws.amazon.com) in "work" so they beat a
// broader parent domain listed further down.
export const CATEGORY_ORDER = ["work", "communication", "research", "ambiguous", "distracting"];

export const CATEGORY_RULES = {
  work: {
    domains: [
      "docs.google.com",
      "drive.google.com",
      "sheets.google.com",
      "slides.google.com",
      "coursera.org",
      "udemy.com",
      "edx.org",
      "khanacademy.org",
      "notion.so",
      "notion.site",
      "github.com",
      "gitlab.com",
      "bitbucket.org",
      "figma.com",
      "linear.app",
      "atlassian.net",
      "vercel.com",
      "netlify.com",
      "supabase.com",
      "aws.amazon.com",
      "console.cloud.google.com",
      "portal.azure.com",
      "localhost",
      "127.0.0.1",
      "replit.com",
      "codepen.io",
      "codesandbox.io",
      "overleaf.com",
      "canva.com",
      "miro.com",
      "trello.com",
      "asana.com",
      "airtable.com"
    ],
    // Self-hosted Jira / Confluence: jira.company.com, confluence.corp.example
    labels: ["jira", "confluence"]
  },
  communication: {
    domains: [
      "mail.google.com",
      "gmail.com",
      "outlook.live.com",
      "outlook.office.com",
      "slack.com",
      "discord.com",
      "teams.microsoft.com",
      "meet.google.com",
      "zoom.us"
    ]
  },
  research: {
    domains: [
      "google.com",
      "bing.com",
      "duckduckgo.com",
      "perplexity.ai",
      "chatgpt.com",
      "claude.ai",
      "wikipedia.org",
      "stackoverflow.com",
      "stackexchange.com",
      "developer.mozilla.org",
      "learn.microsoft.com",
      "arxiv.org",
      "scholar.google.com"
    ],
    // docs.python.org, docs.github.com, docs.anything
    firstLabels: ["docs", "developer", "developers"]
  },
  ambiguous: {
    domains: [
      "youtube.com",
      "youtu.be",
      "reddit.com",
      "x.com",
      "twitter.com",
      "linkedin.com",
      "medium.com",
      "substack.com",
      "news.ycombinator.com"
    ]
  },
  distracting: {
    domains: [
      "instagram.com",
      "tiktok.com",
      "facebook.com",
      "netflix.com",
      "twitch.tv",
      "pinterest.com",
      "amazon.com",
      "ebay.com",
      "hulu.com",
      "disneyplus.com",
      "primevideo.com",
      "crunchyroll.com",
      "kwik.cx",
      "zoro.to",
      "dailymotion.com",
      "9gag.com",
      "imgur.com",
      "quora.com",
      "temu.com",
      "aliexpress.com",
      "shein.com",
      "roblox.com",
      "steampowered.com",
      "chess.com",
      "onlyfans.com",
      "pornhub.com",
      "xvideos.com",
      "xnxx.com"
    ],
    // Streaming mirrors rotate TLDs and add suffixes (9animetv.to, fmoviesz.to),
    // so match any hostname label that starts with the brand.
    labelPrefixes: [
      "animepahe",
      "9anime",
      "aniwatch",
      "hianime",
      "gogoanime",
      "fmovies",
      "soap2day",
      "putlocker",
      "123movies",
      "streameast",
      "buffstream"
    ]
  }
};

export const DRIFT_CATEGORIES = ["ambiguous", "distracting", "unknown"];
export const ALIGNED_CATEGORIES = ["work", "research", "communication"];

export function normalizeDomain(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  try {
    const maybeUrl = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return maybeUrl.hostname.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return raw.replace(/^www\./, "").replace(/[/:].*$/, "").replace(/\.$/, "");
  }
}

export function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").replace(/\.$/, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isTrackableUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Exact domain or a subdomain of it. Never a substring: "netflix.com" is not
// "x.com", and "jiraiya-fan.net" is not "jira".
export function domainMatches(domain, pattern) {
  const d = normalizeDomain(domain);
  const p = normalizeDomain(pattern);
  if (!d || !p) return false;
  return d === p || d.endsWith(`.${p}`);
}

export function normalizeDomainList(value) {
  const list = typeof value === "string" ? value.split(/[\n,\s]+/) : Array.isArray(value) ? value : [];
  return Array.from(new Set(list.map((item) => normalizeDomain(item)).filter(Boolean)));
}

export function isExcludedDomain(domain, excludedDomains) {
  return normalizeDomainList(excludedDomains).some((excluded) => domainMatches(domain, excluded));
}

export function isAllowedDomain(domain, allowedDomains) {
  return normalizeDomainList(allowedDomains || []).some((allowed) => domainMatches(domain, allowed));
}

function matchesRule(domain, rule) {
  if (rule.domains?.some((pattern) => domainMatches(domain, pattern))) return true;

  const labels = domain.split(".");
  if (rule.labels?.some((label) => labels.includes(label))) return true;
  // Only the registrable part and below: "docs" must be the first label of a
  // multi-label host (docs.python.org), not a bare "docs" intranet name.
  if (labels.length > 2 && rule.firstLabels?.includes(labels[0])) return true;
  if (rule.labelPrefixes?.some((prefix) => labels.some((label) => label.startsWith(prefix)))) return true;

  return false;
}

// Built-in category for a domain, ignoring any session context.
export function getBaseCategory(domain) {
  const clean = normalizeDomain(domain);
  if (!clean) return "unknown";

  for (const category of CATEGORY_ORDER) {
    if (matchesRule(clean, CATEGORY_RULES[category])) return category;
  }

  return "unknown";
}

// Category for scoring and recaps. Domains the user trusted for *this* session
// count as work; nothing is remembered across sessions.
export function getDomainCategory(domain, session) {
  if (!domain) return "unknown";
  if (session && isAllowedDomain(domain, session.allowedDomains)) return "work";
  return getBaseCategory(domain);
}
