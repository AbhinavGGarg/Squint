#!/usr/bin/env tsx
/**
 * squint CLI
 *   npx tsx scripts/cli.ts <url-or-file.html> [--type portfolio|landing|hackathon|ecommerce|docs|other] [--goal "..."] [--json] [--no-impeccable] [--no-judge] [--fail-under 70]
 */
import { readFile } from "node:fs/promises";
import { analyze } from "../src/engine/analyze";
import { closeBrowser } from "../src/engine/render";
import { grade } from "../src/engine/score";
import type { PageType } from "../src/engine/types";

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    console.error("usage: squint <url|file.html> [--type portfolio] [--goal '...'] [--json] [--no-impeccable] [--no-judge] [--no-mobile] [--fail-under N]");
    process.exit(1);
  }
  const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const has = (name: string) => args.includes(`--${name}`);
  const input = /^https?:\/\//.test(target) ? { url: target } : { html: await readFile(target, "utf8") };
  const report = await analyze({
    ...input,
    pageType: (opt("type") as PageType) || "other",
    goal: opt("goal"),
    skipImpeccable: has("no-impeccable"),
    skipJudge: has("no-judge"),
    skipMobile: has("no-mobile"),
  });
  await closeBrowser();
  if (has("json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const g = grade(report.score);
    console.log(`\n${report.page.title || target}\n${"─".repeat(60)}`);
    console.log(`Score ${report.score}/100  ${g.letter} — ${g.word}`);
    console.log(`  consistency ${report.subScores.consistency}  generic ${report.subScores.generic}  clarity ${report.subScores.clarity}  appeal ${report.subScores.appeal}`);
    if (report.metrics) console.log(`  complexity ${report.metrics.complexityLeaves} leaves · colorfulness ${report.metrics.colorfulness} · whitespace ${Math.round(report.metrics.whitespaceRatio * 100)}%`);
    console.log(`  engines: ${report.engines.map((e) => `${e.name}${e.ok ? "" : "✗"}(${e.durationMs}ms)`).join(" ")}`);
    if (report.judgeSkipped) console.log(`  judge: ${report.judgeSkipped}`);
    console.log("");
    for (const f of report.findings) {
      const tag = f.severity === "error" ? "ERR " : f.severity === "warn" ? "WARN" : "info";
      console.log(`${tag} [${f.category}/${f.confidence}] ${f.title}`);
      console.log(`     ${f.evidence}`);
      console.log(`     → ${f.fix}`);
    }
    console.log(`\nreport id ${report.id} (.squint/reports/${report.id})`);
  }
  const failUnder = opt("fail-under");
  if (failUnder && report.score < Number(failUnder)) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
