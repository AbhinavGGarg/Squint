/**
 * Regression check: the fixtures must keep producing the findings they were
 * written for, and the clean fixture must stay clean.
 *   npm run verify
 */
import { readFile } from "node:fs/promises";
import { analyze } from "../src/engine/analyze";
import { closeBrowser } from "../src/engine/render";

interface Case { file: string; type: "portfolio" | "landing"; mustHave: string[]; mustNotHave?: string[]; scoreBelow?: number; scoreAbove?: number }

const CASES: Case[] = [
  {
    file: "fixtures/portfolio.html", type: "portfolio",
    // The four things a front-end engineer spotted in ten seconds on the real page.
    mustHave: ["container-vs-content", "stretched-row-cards", "heading-size-drift", "decorative-badge"],
    mustNotHave: ["ai-purple", "neon-glow", "emoji-as-icons", "placeholder-content"],
  },
  {
    file: "fixtures/saas-slop.html", type: "landing",
    mustHave: ["ai-purple", "gradient-text", "neon-glow", "emoji-as-icons", "three-equal-cards", "marketing-buzzwords", "contrastive-reframe", "placeholder-content", "pulsing-dot", "cards-in-cards", "generic-headline", "icon-tile-stack", "hero-eyebrow-chip"],
    scoreBelow: 60,
  },
  {
    file: "fixtures/clean.html", type: "portfolio",
    mustHave: [],
    mustNotHave: ["ai-purple", "neon-glow", "emoji-as-icons", "three-equal-cards", "marketing-buzzwords", "cards-in-cards", "container-vs-content", "decorative-badge", "heading-size-drift", "cramped-padding"],
    scoreAbove: 85,
  },
  {
    // A polished product page in the manner of a large company: DOM-drawn illustrations, a bar
    // chart graphic, a nav with a grouped gap, inline links in prose, example.com in a code sample.
    // Everything here is a decision, so the geometry and copy rules must stay quiet.
    file: "fixtures/polished.html", type: "landing",
    mustHave: [],
    mustNotHave: ["container-vs-content", "stretched-row-cards", "misaligned-siblings", "uneven-gaps", "cramped-padding", "cards-in-cards", "placeholder-content", "tasteful-default", "heading-size-drift", "decorative-badge", "mobile-tap-targets"],
    scoreAbove: 85,
  },
];

async function main() {
let failed = 0;
for (const c of CASES) {
  const html = await readFile(c.file, "utf8");
  const r = await analyze({ html, pageType: c.type, skipJudge: true, skipImpeccable: true });
  const rules = new Set(r.findings.map((f) => f.rule));
  const problems: string[] = [];
  for (const m of c.mustHave) if (!rules.has(m)) problems.push(`missing ${m}`);
  for (const m of c.mustNotHave || []) if (rules.has(m)) problems.push(`unexpected ${m}`);
  if (c.scoreBelow !== undefined && r.score >= c.scoreBelow) problems.push(`score ${r.score} not below ${c.scoreBelow}`);
  if (c.scoreAbove !== undefined && r.score <= c.scoreAbove) problems.push(`score ${r.score} not above ${c.scoreAbove}`);
  console.log(`${problems.length ? "FAIL" : "ok  "} ${c.file} score=${r.score} findings=${[...rules].join(",")}`);
  for (const p of problems) console.log(`      ${p}`);
  if (problems.length) failed++;
}
await closeBrowser();
if (failed) { console.error(`\n${failed} fixture(s) failed`); process.exit(1); }
console.log("\nall fixtures pass");
}
main().catch((e) => { console.error(e); process.exit(1); });
