/**
 * The template kit, counted. One centered hero is a layout; one eyebrow chip is a habit; Inter is
 * a font. Six of them on one page is the thing every builder emits when nobody chooses anything,
 * and that co-occurrence is the actual "looks generated" signal. Individually these tells are
 * notes that don't score; together they become a finding that does.
 */
import type { Finding } from "../types";
import { mk } from "./util";

const TELLS: Record<string, string> = {
  "shadcn-untouched": "untouched shadcn cards",
  "centered-hero": "centered hero",
  "hero-eyebrow-chip": "eyebrow chip over the h1",
  "caps-labels": "tracked caps labels",
  "three-equal-cards": "three equal feature cards",
  "icon-tile-stack": "icon tiles above headings",
  "stat-banner": "stat banner",
  "numbered-steps": "numbered how-it-works steps",
  "overused-font": "the default font",
  "em-dash-density": "em-dash copy",
  "aurora-blob": "aurora blobs",
  "rounded-everything": "everything rounded",
  "gradient-text": "gradient text",
  "ai-purple": "the violet accent",
  "perma-dark": "permanent dark mode",
  "status-dots": "status dots",
  "pulsing-dot": "a pulsing dot",
  "emoji-as-icons": "emoji icons",
  "marketing-buzzwords": "buzzword copy",
  "formulaic-copy": "formulaic openers/closers",
  "contrastive-reframe": "“not just X, it's Y”",
  "whether-youre": "“whether you're…”",
  "unsourced-social-proof": "unsourced social proof",
  "fake-window-chrome": "fake window dots",
  "glassmorphism": "glass panels",
  "logo-bar": "a logo bar",
  "neon-glow": "neon glow",
  "tasteful-default": "the cream-and-sage default",
  "decorative-badge": "a decorative badge",
  "inert-tags": "inert tag pills",
  "cards-in-cards": "cards in cards",
  "sparkle-badge": "a sparkle badge",
  "gradient-avatar": "gradient letter avatars",
  "accent-stripe": "accent stripes",
  "animation-overload": "motion on everything",
  "builder-signature": "the builder's own badge or defaults",
};

export function templateStack(findings: Finding[]): Finding[] {
  const present = [...new Set(findings.map((f) => f.rule).filter((r) => TELLS[r]))];
  // The builder's signature is not a style choice; it counts for two.
  const n = present.length + (present.includes("builder-signature") ? 1 : 0);
  if (n < 4) return [];
  const names = present.map((r) => TELLS[r]);
  return [mk({
    rule: "template-stack", source: "squint", category: "generic", severity: n >= 6 ? "error" : "warn", confidence: "heuristic",
    title: `The default kit: ${present.length} of its tells on one page`,
    evidence: `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}. Any one of these is a choice somebody could defend. Together they are the page every builder produces before anyone edits it: the reader has seen this exact page a hundred times this month and will assume nobody is home.`,
    fix: "Pick the three that matter least and remove them today: usually the eyebrow chip, the caps labels and the icon tiles. Then change one thing a template would never do (a real photograph, a typeface with a point of view, a headline with a number in it).",
    citation: "vibecoded-design-tells (MIT) and the 500 Show HN launches: no single tell separates generated from made; the count does",
    data: { tells: present, count: n },
  })];
}
