export type Severity = "error" | "warn" | "info";

/** How much the finding can be trusted, and why. */
export type Confidence =
  | "measured" // read straight from DOM geometry / computed styles — a fact
  | "heuristic" // a rule with thresholds — usually right, can misfire
  | "judgment"; // an LLM opinion grounded in the evidence — treat as a reviewer's comment

export type Category =
  | "consistency" // alignment, spacing, type scale, radius — "a pro engineer would notice"
  | "generic" // AI / template fingerprints in visuals
  | "copy" // AI / generic language
  | "clarity" // can someone tell what this is in 10 seconds
  | "appeal" // first-impression metrics (complexity, colorfulness)
  | "quality"; // accessibility / overflow / contrast from Impeccable

export type Source = "squint" | "impeccable" | "judge" | "metrics";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Finding {
  id: string;
  rule: string;
  source: Source;
  category: Category;
  severity: Severity;
  confidence: Confidence;
  title: string;
  /** What was measured / seen. Numbers in here. */
  evidence: string;
  /** What to do about it. */
  fix: string;
  /** Boxes to draw on the full-page screenshot, in CSS px at the capture viewport width. */
  rects?: Rect[];
  /** Research or tool this rule is grounded in. */
  citation?: string;
  /** Extra structured data, shown collapsed in the UI. */
  data?: Record<string, unknown>;
}

export type PageType =
  | "portfolio"
  | "landing"
  | "hackathon"
  | "ecommerce"
  | "docs"
  | "other";

export interface SubScores {
  consistency: number;
  generic: number;
  clarity: number;
  appeal: number;
}

export interface AppealMetrics {
  colorfulness: number; // Hasler & Süsstrunk M, typically 0–150
  complexityLeaves: number; // quadtree leaf count on an 800px-wide capture
  whitespaceRatio: number; // 0–1 share of pixels close to the page background
  textDensity: number; // 0–1 share of viewport covered by text boxes
  distinctHues: number;
  dominantBackground: string;
}

export interface JudgeResult {
  provider: string;
  model: string;
  tenSecondTest: {
    whatIsThis: string;
    whoIsItFor: string;
    whyCare: string;
    passed: boolean;
    score: number; // 0–100
    missing: string[];
  };
  genericCopy: { quote: string; why: string; rewrite: string }[];
  tailoredAdvice: { title: string; why: string; fix: string }[];
  critiques: {
    expectedStandard: string;
    currentDesign: string;
    fix: string;
    rect?: Rect;
  }[];
}

export interface Report {
  id: string;
  createdAt: string;
  input: { url?: string; html?: boolean; pageType: PageType; goal?: string };
  page: {
    title: string;
    finalUrl: string;
    viewport: { width: number; height: number };
    fullHeight: number;
    elementCount: number;
    wordCount: number;
    fonts: string[];
  };
  score: number;
  subScores: SubScores;
  findings: Finding[];
  metrics?: AppealMetrics;
  judge?: JudgeResult;
  judgeSkipped?: string;
  engines: { name: string; ok: boolean; note?: string; durationMs: number }[];
  screenshot: { viewport: string; full: string; fullSize: { w: number; h: number }; mobile?: string; mobileSize?: { w: number; h: number } };
  mobile?: { scrollWidth: number; overflow: boolean; tinyText: number; smallTargets: number; durationMs: number };
  /** Set when the page was too heavy for the hosted browser and was re-rendered without images/media. */
  renderMode?: "light";
}

/** One element as captured in the browser. */
export interface El {
  i: number; // index
  p: number; // parent index, -1 for root
  d: number; // depth
  tag: string;
  id: string;
  cls: string;
  role: string; // explicit role attr
  hid?: boolean; // inside aria-hidden="true": decorative to assistive tech, usually a mockup or illustration
  r: Rect; // bounding rect in page coords
  text: string; // direct text (not descendants), trimmed, ≤120 chars
  tlen: number; // full textContent length
  words: number;
  inter: boolean; // interactive
  land: boolean; // landmark / sectioning
  cr?: Rect; // content rect: union of descendant text + media boxes
  nkids: number;
  s: {
    display: string;
    position: string;
    fontSize: number;
    fontWeight: number;
    fontFamily: string;
    lineHeight: number;
    color: string;
    bg: string;
    bgImage: string;
    radius: string;
    radiusPx: number;
    border: [number, number, number, number]; // t r b l widths
    borderColor: string;
    shadow: string;
    textShadow: string;
    pad: [number, number, number, number];
    letterSpacing: string;
    textTransform: string;
    opacity: number;
    animation: string;
    overflow: string;
    flex: string; // "row" | "column" | "" for flex/grid containers
    cursor: string;
    bgClip: string;
    backdrop: string; // "blur" when a backdrop-filter is set
    filter: string;
    textAlign: string;
  };
}

export interface Snapshot {
  title: string;
  url: string;
  viewport: { width: number; height: number };
  fullHeight: number;
  scrollWidth: number;
  bodyBg: string;
  bodyText: string;
  fonts: string[];
  text: string; // visible text, whitespace-normalized
  headings: { level: number; text: string; i: number }[];
  els: El[];
  stylesheetText: string; // concatenated same-origin CSS (truncated)
  keyframes: string[]; // names of @keyframes declared
}
