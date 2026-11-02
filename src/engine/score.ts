/**
 * Scoring. Per category, UXly's decaying-weight scheme: the i-th finding in a
 * category counts 1/(1+i) of its base weight, so one problem repeated ten times
 * doesn't zero the score while ten different problems do. Judgment findings are
 * weighted lower than measured ones; info findings don't score.
 */
import type { Finding, SubScores } from "./types";

const BASE = { error: 14, warn: 7, info: 0 } as const;
const CONF = { measured: 1, heuristic: 0.8, judgment: 0.6 } as const;

function categoryScore(findings: Finding[]): number {
  const byRule = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, []);
    byRule.get(f.rule)!.push(f);
  }
  let penalty = 0;
  for (const group of byRule.values()) {
    group.sort((a, b) => BASE[b.severity] - BASE[a.severity]);
    group.forEach((f, i) => { penalty += (BASE[f.severity] * CONF[f.confidence]) / (1 + i); });
  }
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

export function computeScores(findings: Finding[], appealScore: number | undefined, tenSecondScore: number | undefined): { score: number; subScores: SubScores } {
  const consistency = categoryScore(findings.filter((f) => f.category === "consistency" || f.category === "quality"));
  const generic = categoryScore(findings.filter((f) => f.category === "generic" || f.category === "copy"));
  const clarityFromFindings = categoryScore(findings.filter((f) => f.category === "clarity"));
  const clarity = tenSecondScore === undefined ? clarityFromFindings : Math.round(0.6 * tenSecondScore + 0.4 * clarityFromFindings);
  const appeal = appealScore ?? 100;
  // Weights: what a reviewer notices first. Consistency and generic-ness are the
  // thesis of the product; clarity matters most but is only partly measured.
  const weights = tenSecondScore === undefined
    ? { consistency: 0.35, generic: 0.45, clarity: 0.0, appeal: 0.2 }
    : { consistency: 0.25, generic: 0.35, clarity: 0.25, appeal: 0.15 };
  const score = Math.round(consistency * weights.consistency + generic * weights.generic + clarity * weights.clarity + appeal * weights.appeal);
  return { score, subScores: { consistency, generic, clarity, appeal } };
}

export function grade(score: number) {
  if (score >= 90) return { letter: "A", word: "Looks decided" };
  if (score >= 75) return { letter: "B", word: "Mostly deliberate" };
  if (score >= 60) return { letter: "C", word: "Template showing" };
  if (score >= 40) return { letter: "D", word: "Generated, unedited" };
  return { letter: "F", word: "Slop" };
}
