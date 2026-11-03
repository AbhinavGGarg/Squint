#!/usr/bin/env node
/**
 * squint-test — run the squint test on a URL from the terminal or CI.
 *
 *   npx squint-test https://your-site.com
 *   npx squint-test https://your-site.com --type portfolio --fail-under 70
 *   npx squint-test https://your-site.com --json
 *
 * Talks to a hosted Squint (default: https://squint-rosy.vercel.app; override with
 * SQUINT_HOST or --host). No dependencies, no browser install: the host renders.
 * Exit codes: 0 ok · 2 score below --fail-under · 1 error.
 */
const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--"));
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const has = (n) => args.includes(`--${n}`);
const host = (opt("host") || process.env.SQUINT_HOST || "https://squint-rosy.vercel.app").replace(/\/$/, "");

if (!url || has("help")) {
  console.error(`usage: squint-test <url> [--type landing|portfolio|hackathon|ecommerce|docs|other] [--goal "..."] [--fresh] [--json] [--fail-under N] [--timeout SEC] [--host https://...]`);
  process.exit(url ? 0 : 1);
}

const SEV = { error: "ERR ", warn: "WARN", info: "info" };
const grade = (s) => (s >= 90 ? "A" : s >= 75 ? "B" : s >= 60 ? "C" : s >= 40 ? "D" : "F");

(async () => {
  const t0 = Date.now();
  if (!has("json")) process.stderr.write(`squint-test · ${url}\n`);
  let res;
  const tick = has("json") ? null : setInterval(() => process.stderr.write(`  …rendering, ${Math.round((Date.now() - t0) / 1000)}s\n`), 10_000);
  try {
    for (let attempt = 0; ; attempt++) {
      res = await fetch(`${host}/api/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(process.env.SQUINT_TOKEN || opt("token") ? { "x-squint-token": opt("token") || process.env.SQUINT_TOKEN } : {}) },
        body: JSON.stringify({ url, pageType: opt("type") || "other", goal: opt("goal"), fresh: has("fresh") }),
        signal: AbortSignal.timeout(Number(opt("timeout") || 180) * 1000),
      });
      // 503 = the hosted engine is busy; it says when to come back. Three polite retries, then give up.
      if (res.status !== 503 || attempt >= 3) break;
      const wait = Math.min(60, Number(res.headers.get("retry-after")) || 30);
      if (!has("json")) process.stderr.write(`  …engine busy, retrying in ${wait}s\n`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  } catch (e) {
    console.error(e.name === "TimeoutError" ? `no answer from ${host} after ${opt("timeout") || 180}s (--timeout to change)` : `could not reach ${host}: ${e.message}`);
    process.exit(1);
  } finally {
    if (tick) clearInterval(tick);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`error: ${j.error || res.status}`); if (j.detail) console.error(`detail: ${j.detail}`); process.exit(1); }
  const rep = await (await fetch(`${host}/api/report/${j.id}`)).json();
  if (has("json")) { console.log(JSON.stringify(rep, null, 2)); }
  else {
    const counts = { error: 0, warn: 0, info: 0 };
    for (const f of rep.findings) counts[f.severity]++;
    console.log(`\n${rep.page.title || url}`);
    console.log("─".repeat(60));
    console.log(`Score ${rep.score}/100  ${grade(rep.score)}  · ${counts.error} errors, ${counts.warn} warnings, ${counts.info} notes${j.cached ? " · cached" : ""} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`  consistency ${rep.subScores.consistency}  not-generic ${rep.subScores.generic}  first-impression ${rep.subScores.appeal}`);
    console.log("");
    for (const f of rep.findings) {
      if (f.severity === "info" && !has("all")) continue;
      console.log(`${SEV[f.severity]} [${f.category}/${f.confidence}] ${f.title}`);
      console.log(`     ${f.evidence}`);
      console.log(`     → ${f.fix}`);
    }
    if (!has("all") && counts.info) console.log(`(${counts.info} notes hidden; pass --all to show)`);
    console.log(`\nreport: ${host}/r/${rep.id}`);
  }
  const fu = opt("fail-under");
  if (fu && rep.score < Number(fu)) { console.error(`\nscore ${rep.score} is below ${fu}`); process.exit(2); }
})();
