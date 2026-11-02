/**
 * Page-type presets: the same rule can be a real problem on a landing page and
 * irrelevant on docs. Presets never add findings; they downgrade or drop ones
 * that don't apply to the page's job, so the score reflects the right question.
 */
import type { Finding, PageType, Severity } from "./types";

type Adjust = Record<string, Severity | "drop">;

const PRESETS: Record<PageType, Adjust> = {
  landing: {},
  portfolio: {
    // Marketing-page skeleton tells matter less; the reader is one person deciding whether to reply.
    "three-equal-cards": "info", "centered-hero": "info", "numbered-steps": "info", "stat-banner": "info",
    "imp:oversized-h1": "info",
  },
  hackathon: {
    // Built in 36 hours: placeholders are a fail, but template structure is forgivable.
    "centered-hero": "info", "numbered-steps": "info", "caps-labels": "info", "perma-dark": "drop", "overused-font": "drop",
  },
  ecommerce: {
    // Product grids are rows of equal cards by nature; stat strips and logo bars are normal retail furniture.
    "three-equal-cards": "drop", "stat-banner": "drop", "logo-bar": "info", "inert-tags": "drop", "rounded-everything": "drop",
  },
  docs: {
    // Docs are text; marketing tells don't apply and dense pages are expected.
    "centered-hero": "drop", "three-equal-cards": "drop", "hero-eyebrow-chip": "drop", "generic-headline": "drop", "stat-banner": "drop",
    "numbered-steps": "drop", "high-visual-complexity": "drop", "low-whitespace": "drop", "perma-dark": "drop", "caps-labels": "drop",
    "marketing-buzzwords": "info", "cards-in-cards": "info",
  },
  other: {},
};

export function applyPreset(findings: Finding[], pageType: PageType): Finding[] {
  const adj = PRESETS[pageType] || {};
  const out: Finding[] = [];
  for (const f of findings) {
    const a = adj[f.rule];
    if (a === "drop") continue;
    if (a && a !== f.severity) out.push({ ...f, severity: a, data: { ...f.data, presetAdjusted: `${f.severity}→${a} for ${pageType}` } });
    else out.push(f);
  }
  return out;
}

export const PRESET_NOTES: Record<PageType, string> = {
  landing: "Full rule set.",
  portfolio: "Marketing-skeleton tells downgraded; the reader is one person deciding whether to reply.",
  hackathon: "Template structure forgiven; placeholders and clarity still count.",
  ecommerce: "Product grids, stat strips and logo bars are normal retail furniture; skipped.",
  docs: "Marketing and density rules skipped; hierarchy, consistency and copy still count.",
  other: "Full rule set.",
};
