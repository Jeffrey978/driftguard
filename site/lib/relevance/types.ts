/** Shapes shared by the /api/relevance handler and its pure helpers. See /AI_CHECK.md for the contract. */

export type RelevancePage = {
  url: string;
  title: string;
  description?: string;
  headings?: string[];
  text?: string;
};

export type RelevanceContext = {
  workTitle?: string;
  workDomain?: string;
  recentDomains?: string[];
};

export type RelevanceRequest = {
  intention: string;
  page: RelevancePage;
  context?: RelevanceContext;
  screenshot?: string;
};

export type Verdict = {
  related: boolean;
  confidence: number;
  reason: string;
};
