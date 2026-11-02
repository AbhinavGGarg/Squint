import { randomBytes } from "node:crypto";
import { render } from "./render";
import { consistencyRules } from "./rules/consistency";
import { containerRules } from "./rules/container";
import { fingerprintRules } from "./rules/fingerprints";
import { copyRules } from "./rules/copy";
import { resetIds } from "./rules/util";
import { appealMetrics } from "./metrics/appeal";
import { runImpeccable } from "./impeccable";
import { runJudge } from "./judge/judge";
import { computeScores } from "./score";
import { saveReport } from "./store";
import sharp from "sharp";
import type { Finding, PageType, Report } from "./types";

export interface AnalyzeInput {
  url?: string;
  html?: string;
  pageType?: PageType;
  goal?: string;
  skipImpeccable?: boolean;
  skipJudge?: boolean;
}

const SEV = { error: 0, warn: 1, info: 2 } as const;
const CONF = { measured: 0, heuristic: 1, judgment: 2 } as const;

export async function analyze(input: AnalyzeInput): Promise<Report> {
  const id = randomBytes(6).toString("hex");
  const pageType = input.pageType ?? "other";
  const engines: Report["engines"] = [];
  const t0 = Date.now();

  const r = await render({ url: input.url, html: input.html });
  engines.push({ name: "render", ok: true, durationMs: Date.now() - t0, note: `${r.snapshot.els.length} elements, ${r.snapshot.fullHeight}px tall` });

  resetIds();
  let findings: Finding[] = [];
  const t1 = Date.now();
  try {
    findings.push(...consistencyRules(r.snapshot), ...containerRules(r.snapshot), ...fingerprintRules(r.snapshot), ...copyRules(r.snapshot));
    engines.push({ name: "squint-rules", ok: true, durationMs: Date.now() - t1, note: `${findings.length} findings` });
  } catch (e) {
    engines.push({ name: "squint-rules", ok: false, durationMs: Date.now() - t1, note: String(e) });
  }

  // Appeal metrics and Impeccable can run in parallel with each other.
  const t2 = Date.now();
  const [appeal, imp] = await Promise.all([
    appealMetrics(r.viewportPng, r.snapshot).then((a) => ({ ok: true as const, a })).catch((e) => ({ ok: false as const, e })),
    input.skipImpeccable ? Promise.resolve(null) : runImpeccable({ url: input.url, html: r.html }).catch((e) => ({ findings: [], note: String(e), ok: false })),
  ]);
  if (appeal.ok) {
    findings.push(...appeal.a.findings);
    engines.push({ name: "appeal-metrics", ok: true, durationMs: Date.now() - t2 });
  } else engines.push({ name: "appeal-metrics", ok: false, durationMs: Date.now() - t2, note: String(appeal.e) });
  if (imp) {
    // Drop Impeccable findings that duplicate ours.
    const ours = new Set(findings.map((f) => f.rule));
    const DUP: Record<string, string> = { "imp:gradient-text": "gradient-text", "imp:dark-glow": "neon-glow", "imp:hero-eyebrow-chip": "hero-eyebrow-chip", "imp:icon-tile-stack": "icon-tile-stack", "imp:nested-cards": "cards-in-cards", "imp:pulsing-dot": "pulsing-dot", "imp:marketing-buzzword": "marketing-buzzwords", "imp:em-dash-overuse": "em-dash-density", "imp:flat-type-hierarchy": "flat-type-hierarchy", "imp:overused-font": "overused-font", "imp:cramped-padding": "cramped-padding", "imp:cream-palette": "tasteful-default", "imp:ai-color-palette": "ai-purple", "imp:oversized-h1": "generic-headline" };
    findings.push(...imp.findings.filter((f) => !(DUP[f.rule] && ours.has(DUP[f.rule]))));
    engines.push({ name: "impeccable", ok: imp.ok, durationMs: Date.now() - t2, note: imp.note });
  }

  let judgeResult: Report["judge"];
  let judgeSkipped: string | undefined;
  if (!input.skipJudge) {
    const t3 = Date.now();
    try {
      const j = await runJudge({ snap: r.snapshot, viewportPng: r.viewportPng, pageType, goal: input.goal, measured: findings });
      judgeResult = j.result;
      judgeSkipped = j.skipped;
      findings.push(...j.findings);
      engines.push({ name: "judge", ok: !!j.result, durationMs: Date.now() - t3, note: j.result ? `${j.result.provider}/${j.result.model}` : j.skipped });
    } catch (e) {
      judgeSkipped = `Judge failed: ${String(e).slice(0, 200)}`;
      engines.push({ name: "judge", ok: false, durationMs: Date.now() - t3, note: judgeSkipped });
    }
  } else judgeSkipped = "Judge skipped by request.";

  findings = findings.sort((a, b) => SEV[a.severity] - SEV[b.severity] || CONF[a.confidence] - CONF[b.confidence]);
  const { score, subScores } = computeScores(findings, appeal.ok ? appeal.a.score : undefined, judgeResult?.tenSecondTest.score);

  const report: Report = {
    id,
    createdAt: new Date().toISOString(),
    input: { url: input.url, html: !!input.html, pageType, goal: input.goal },
    page: {
      title: r.snapshot.title,
      finalUrl: r.finalUrl,
      viewport: r.snapshot.viewport,
      fullHeight: r.snapshot.fullHeight,
      elementCount: r.snapshot.els.length,
      wordCount: r.snapshot.text.split(/\s+/).filter(Boolean).length,
      fonts: r.snapshot.fonts.slice(0, 8),
    },
    score,
    subScores,
    findings,
    metrics: appeal.ok ? appeal.a.metrics : undefined,
    judge: judgeResult,
    judgeSkipped,
    engines,
    screenshot: { viewport: "viewport.png", full: "full.png", fullSize: await pngSize(r.fullPng) },
  };
  await saveReport(report, { viewport: r.viewportPng, full: r.fullPng });
  return report;
}

async function pngSize(buf: Buffer) {
  const m = await sharp(buf).metadata();
  return { w: m.width || 0, h: m.height || 0 };
}
