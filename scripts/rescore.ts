/**
 * Re-score saved report JSONs with the current scoring and template-stack logic, without re-rendering.
 *   npx tsx scripts/rescore.ts calib2/*.json
 */
import { readFileSync } from "node:fs";
import { computeScores } from "../src/engine/score";
import { templateStack } from "../src/engine/rules/stack";
import type { Finding, Report } from "../src/engine/types";

for (const file of process.argv.slice(2)) {
  let r: Report;
  try { r = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
  const base: Finding[] = r.findings.filter((f) => f.rule !== "template-stack");
  const findings = [...base, ...templateStack(base)];
  const appeal = r.subScores.appeal;
  const { score, subScores } = computeScores(findings, appeal, undefined);
  const stack = findings.find((f) => f.rule === "template-stack");
  const sig = findings.find((f) => f.rule === "builder-signature");
  console.log(`${file.replace(/^.*\//, "").padEnd(46)} ${String(r.score).padStart(3)} → ${String(score).padStart(3)}  c${subScores.consistency} g${subScores.generic} a${appeal}${sig ? "  BADGE" : ""}${stack ? `  kit=${(stack.data as { weight: number }).weight}/${stack.severity}` : ""}`);
}
