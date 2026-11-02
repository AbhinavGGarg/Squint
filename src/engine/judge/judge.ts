/**
 * The judgment layer. It gets the measured findings as facts, the first-screen
 * screenshot, the extracted text, and the page's goal; it answers the questions
 * the rules can't: can a stranger tell what this is in ten seconds, is the copy
 * specific, what would a reviewer who knows the goal say.
 *
 * Two design principles from the research:
 *  - The judge is NOT the generator (self-preference bias, arXiv 2410.21819).
 *    It's told the measured facts and asked not to re-derive them.
 *  - Critiques follow UICrit's template (Duan et al., UIST '24, CC-BY-4.0):
 *    "The expected standard is … In the current design, … To fix this, …"
 *    Few-shot examples below are from that dataset.
 */
import type { Finding, JudgeResult, PageType, Rect, Snapshot } from "../types";
import { mk } from "../rules/util";
import { resolveProvider } from "./provider";

const UICRIT_FEWSHOT = [
  `The expected standard is that elements that occupy similar positions in the information hierarchy should be given similar graphic treatment. In the current design, the "Board", "Area PIN code" and "Mobile No" fields are not visually similar. To fix this, make the fields visually similar by using the same font size, color, and background color.`,
  `The expected standard is that the most important information is the most prominent and users can easily understand the purpose of the app. In the current design, the text "Exceptional people at your fingertips" is large and bold, but it doesn't clearly communicate the app's purpose. To fix this, replace it with a more specific tagline that explains what the app does.`,
  `The expected standard is that the design should use as few elements as possible to achieve its goals. In the current design, there are multiple elements that are not necessary, such as the "PLAY" button and the "ON DEMAND" button. To fix this, remove the unnecessary elements so the design is more focused.`,
  `The expected standard is that every element should have some connection to another element on the page. In the current design, the "Customize Weather" title has no connection to the map below it. To fix this, move the title so it is visually attached to the map.`,
  `The expected standard is to maintain appropriate spacing within interface design. In the current design, there is excessive space between the text "Please enable this permission" and the "Enable" button. To fix this, reduce the space so the two read as one unit.`,
];

const GOALS: Record<PageType, string> = {
  portfolio: "A personal portfolio. The reader is a recruiter, admissions officer, or someone deciding whether to reply to an email. In 10–20 seconds they must know: who this person is, the one or two most notable things about them (with evidence), and why they should talk to them. Recruiters spend ~7 seconds on a first pass (Ladders 2018) and reward clear section headings and a single reading path.",
  landing: "A product landing page. In 10 seconds a visitor must know what the product is, who it's for, and one specific reason to believe it. Generic copy that could describe any product in the category is the strongest tell of a generated page.",
  hackathon: "A hackathon project page or demo site. A judge with 2 minutes must understand what was built, what problem it solves, what actually works (not what's planned), and how to try it. 'If nobody understands your project it might as well not exist.'",
  ecommerce: "An e-commerce page. The shopper must find the product, price, trust signals and the path to checkout without friction. Baymard: the average checkout has 32 usability problems; clarity beats persuasion.",
  docs: "Documentation or a reference page. The reader is looking for one specific thing; hierarchy, scannability and a working search/navigation matter more than appeal.",
  other: "A web page. In 10 seconds a stranger should know what it is, who it's for, and what to do next.",
};

export async function runJudge(input: {
  snap: Snapshot;
  viewportPng: Buffer;
  pageType: PageType;
  goal?: string;
  measured: Finding[];
}): Promise<{ result?: JudgeResult; findings: Finding[]; skipped?: string }> {
  const provider = resolveProvider();
  if (!provider) {
    return { findings: [], skipped: "No LLM key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local to enable the 10-second test, generic-copy review and tailored advice." };
  }

  const facts = input.measured
    .filter((f) => f.confidence === "measured")
    .slice(0, 25)
    .map((f) => `- [${f.category}] ${f.title}: ${f.evidence}`)
    .join("\n");
  const headings = input.snap.headings.slice(0, 40).map((h) => `h${h.level}: ${h.text}`).join("\n");
  const text = input.snap.text.slice(0, 6000);

  const system = `You are a senior product designer and front-end engineer reviewing a web page. You are blunt, specific and useful. You never praise. You quote the page's actual words. You do not invent elements that are not in the screenshot or text. You do not re-report the measured facts you are given; you build on them. You write critiques in this exact template: "The expected standard is … In the current design, … To fix this, …" Examples of the standard you hold:\n${UICRIT_FEWSHOT.map((s) => "• " + s).join("\n")}`;

  const user = `PAGE TYPE: ${input.pageType}
GOAL: ${GOALS[input.pageType]}${input.goal ? `\nTHE OWNER SAYS THE GOAL IS: ${input.goal}` : ""}

The attached image is the first screen (above the fold, ${input.snap.viewport.width}×${input.snap.viewport.height}). Look at it first, alone, for the ten-second test.

MEASURED FACTS (already reported; do not repeat them, you may reference them):
${facts || "(none)"}

HEADINGS:
${headings || "(none)"}

VISIBLE TEXT (truncated):
${text}

Answer as strict JSON with this shape and nothing else:
{
  "tenSecondTest": {
    "whatIsThis": "one sentence, from the first screen only",
    "whoIsItFor": "one sentence",
    "whyCare": "the one notable/specific thing the first screen communicates, or 'nothing specific'",
    "passed": true|false,
    "score": 0-100,
    "missing": ["what a stranger still wouldn't know after 10 seconds", "..."]
  },
  "genericCopy": [ { "quote": "exact words from the page", "why": "why it could be on any site", "rewrite": "a specific replacement using facts from the page" } ],
  "tailoredAdvice": [ { "title": "short", "why": "tied to the GOAL above", "fix": "concrete, this page" } ],
  "critiques": [ { "expectedStandard": "...", "currentDesign": "... (quote real elements)", "fix": "...", "rect": {"x":0,"y":0,"w":0,"h":0} } ]
}
Rules: at most 4 genericCopy, at most 5 tailoredAdvice, at most 6 critiques. rect is optional and in CSS pixels of the first screen; omit it if unsure. Most useful advice first. If the page is strong, say so briefly inside the fields; do not pad.`;

  const raw = await provider.complete({ system, user, imagePngBase64: input.viewportPng.toString("base64"), maxTokens: 3500 });
  const json = extractJson(raw);
  if (!json) return { findings: [], skipped: `Judge returned non-JSON (${provider.name}/${provider.model}).` };

  const result: JudgeResult = {
    provider: provider.name,
    model: provider.model,
    tenSecondTest: {
      whatIsThis: str(json.tenSecondTest?.whatIsThis),
      whoIsItFor: str(json.tenSecondTest?.whoIsItFor),
      whyCare: str(json.tenSecondTest?.whyCare),
      passed: !!json.tenSecondTest?.passed,
      score: clamp(num(json.tenSecondTest?.score)),
      missing: arr(json.tenSecondTest?.missing).map(str),
    },
    genericCopy: arr(json.genericCopy).map((g) => ({ quote: str(g.quote), why: str(g.why), rewrite: str(g.rewrite) })).slice(0, 4),
    tailoredAdvice: arr(json.tailoredAdvice).map((g) => ({ title: str(g.title), why: str(g.why), fix: str(g.fix) })).slice(0, 5),
    critiques: arr(json.critiques).map((c) => ({ expectedStandard: str(c.expectedStandard), currentDesign: str(c.currentDesign), fix: str(c.fix), rect: rect(c.rect) })).slice(0, 6),
  };

  const findings: Finding[] = [];
  if (!result.tenSecondTest.passed) {
    findings.push(mk({
      rule: "ten-second-test", source: "judge", category: "clarity", severity: result.tenSecondTest.score < 40 ? "error" : "warn", confidence: "judgment",
      title: "Fails the ten-second test",
      evidence: `From the first screen alone: “${result.tenSecondTest.whatIsThis}” / for “${result.tenSecondTest.whoIsItFor}” / notable: “${result.tenSecondTest.whyCare}”. Still unknown: ${result.tenSecondTest.missing.join("; ") || "—"}.`,
      fix: "Put the one specific, notable thing in the first screen, in words a stranger can repeat. Move everything that isn't that below it.",
      citation: "NN/g: the first 10 seconds decide whether a visit continues; Ladders 2018: 7.4-second recruiter scan",
    }));
  }
  for (const g of result.genericCopy) {
    findings.push(mk({
      rule: "generic-copy", source: "judge", category: "copy", severity: "warn", confidence: "judgment",
      title: `Generic copy: “${g.quote.slice(0, 60)}${g.quote.length > 60 ? "…" : ""}”`,
      evidence: g.why,
      fix: `Try: “${g.rewrite}”`,
      citation: "21st.dev cover-the-logo test",
    }));
  }
  for (const c of result.critiques) {
    findings.push(mk({
      rule: "reviewer-critique", source: "judge", category: "clarity", severity: "info", confidence: "judgment",
      title: c.expectedStandard.replace(/^The expected standard is (that )?/i, "").replace(/\.$/, "").slice(0, 90),
      evidence: c.currentDesign,
      fix: c.fix,
      rects: c.rect ? [c.rect] : undefined,
      citation: "Critique format: UICrit (Duan et al., UIST '24, CC-BY-4.0)",
    }));
  }
  return { result, findings };
}

function extractJson(s: string): Record<string, any> | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : s;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try { return JSON.parse(body.slice(start, end + 1)); } catch { return null; }
}
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v)) || 0);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const arr = (v: unknown): Record<string, any>[] => (Array.isArray(v) ? v : []); // eslint-disable-line @typescript-eslint/no-explicit-any
function rect(v: unknown): Rect | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const x = num(r.x), y = num(r.y), w = num(r.w), h = num(r.h);
  return w > 0 && h > 0 ? { x, y, w, h } : undefined;
}
