/**
 * Runs Impeccable's detector (github.com/pbakaus/impeccable, Apache-2.0) as a
 * second engine and maps its findings into ours. On a URL it uses a locally
 * installed Chrome/Edge for the rendered-page rules; if that fails (no browser,
 * sandboxed network) we fall back to scanning the rendered HTML we already have,
 * which still runs the pattern rules.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Category, Finding, Severity } from "./types";
import { mk } from "./rules/util";

interface ImpFinding {
  antipattern: string;
  name: string;
  description: string;
  severity: string;
  category: string;
  file?: string;
  line?: number;
  snippet?: string;
}

const CLI = path.join(process.cwd(), "node_modules", "impeccable", "cli", "bin", "cli.js");

function run(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    // On serverless the only writable place is /tmp; Impeccable downloads its engine into $HOME/.impeccable.
    const env = { ...process.env, NO_COLOR: "1", ...(serverless ? { HOME: "/tmp", XDG_CACHE_HOME: "/tmp" } : {}) };
    const child = spawn(process.execPath, [CLI, ...args], { stdio: ["ignore", "pipe", "pipe"], env });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => { clearTimeout(t); resolve({ stdout, stderr, code }); });
    child.on("error", () => { clearTimeout(t); resolve({ stdout, stderr: stderr + "\nspawn failed", code: null }); });
  });
}

function parse(stdout: string): ImpFinding[] | null {
  const start = stdout.indexOf("[");
  if (start < 0) return null;
  try {
    const arr = JSON.parse(stdout.slice(start));
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

export async function runImpeccable(opts: { url?: string; html: string }): Promise<{ findings: Finding[]; note: string; ok: boolean }> {
  if (process.env.SQUINT_SKIP_IMPECCABLE) return { findings: [], note: "disabled by SQUINT_SKIP_IMPECCABLE", ok: false };
  let raw: ImpFinding[] | null = null;
  let note = "";
  if (opts.url && /^https?:/.test(opts.url) && !process.env.SQUINT_IMPECCABLE_HTML_ONLY) {
    const r = await run(["detect", "--json", opts.url], 45_000);
    raw = parse(r.stdout);
    if (!raw || (raw.length === 0 && /Error:/.test(r.stdout + r.stderr))) {
      raw = null;
      note = "no local Chrome; ";
    } else note = "rendered-page rules via URL";
  }
  if (!raw) {
    const dir = await mkdtemp(path.join(tmpdir(), "squint-imp-"));
    try {
      await writeFile(path.join(dir, "index.html"), opts.html, "utf8");
      const r = await run(["detect", "--json", dir], 45_000);
      raw = parse(r.stdout);
      note += raw ? "pattern rules on captured HTML" : `failed: ${(r.stderr || r.stdout).slice(0, 200)}`;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  if (!raw) return { findings: [], note, ok: false };
  // In HTML-only mode Impeccable has no computed styles, so rules that need rendered sizes/colours
  // guess (e.g. every heading "16px"). Keep only its pattern rules there; our own DOM rules cover the rest.
  const htmlOnly = /captured HTML/.test(note);
  const NEEDS_RENDER = /flat-type-hierarchy|low-contrast|gray-on-color|tiny-text|undersized-ui-text|line-length|cramped-padding|tight-leading|heading-rhythm|text-overflow|clipped-overflow|edge-flush|text-occlusion|viewport|oversized-h1|skipped-heading|straggler|unbalanced-heading|marquee|organic-clip-path|broken-image/;
  if (htmlOnly) raw = raw.filter((f) => !NEEDS_RENDER.test(f.antipattern));

  // Collapse duplicates of the same rule; keep count and first snippet.
  const byRule = new Map<string, { f: ImpFinding; count: number; snippets: string[] }>();
  for (const f of raw) {
    const cur = byRule.get(f.antipattern);
    if (cur) { cur.count++; if (f.snippet && cur.snippets.length < 3) cur.snippets.push(f.snippet); }
    else byRule.set(f.antipattern, { f, count: 1, snippets: f.snippet ? [f.snippet] : [] });
  }
  const findings: Finding[] = [];
  for (const { f, count, snippets } of byRule.values()) {
    findings.push(mk({
      rule: `imp:${f.antipattern}`, source: "impeccable", category: mapCategory(f), severity: mapSeverity(f.severity),
      confidence: f.severity === "advisory" ? "heuristic" : "measured",
      title: count > 1 ? `${f.name} (×${count})` : f.name,
      evidence: snippets.length ? snippets.map((s) => `“${s}”`).join(" · ") : f.description,
      fix: f.description,
      citation: "Impeccable detector (Apache-2.0, pbakaus/impeccable)",
      data: { count },
    }));
  }
  return { findings, note, ok: true };
}

function mapSeverity(s: string): Severity {
  if (s === "error") return "error";
  if (s === "warning") return "warn";
  return "info";
}
function mapCategory(f: ImpFinding): Category {
  if (f.category === "slop") {
    return /buzzword|em-dash|aphoristic|theater|phrase/.test(f.antipattern) ? "copy" : "generic";
  }
  if (/heading|rhythm|cramped|leading|line-length|monotonous|straggler|unbalanced|tracking|design-system/.test(f.antipattern)) return "consistency";
  return "quality";
}
