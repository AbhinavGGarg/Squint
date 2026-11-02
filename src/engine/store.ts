import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Report } from "./types";

const ROOT = process.env.SQUINT_DATA_DIR || path.join(process.cwd(), ".squint");

function dir(id: string) {
  if (!/^[a-f0-9]{12}$/.test(id)) throw new Error("bad report id");
  return path.join(ROOT, "reports", id);
}

export async function saveReport(report: Report, pngs: { viewport: Buffer; full: Buffer }) {
  const d = dir(report.id);
  await mkdir(d, { recursive: true });
  await Promise.all([
    writeFile(path.join(d, "report.json"), JSON.stringify(report, null, 2)),
    writeFile(path.join(d, "viewport.png"), pngs.viewport),
    writeFile(path.join(d, "full.png"), pngs.full),
  ]);
}

export async function loadReport(id: string): Promise<Report | null> {
  try {
    return JSON.parse(await readFile(path.join(dir(id), "report.json"), "utf8")) as Report;
  } catch {
    return null;
  }
}

export async function loadScreenshot(id: string, which: "viewport" | "full"): Promise<Buffer | null> {
  try {
    return await readFile(path.join(dir(id), `${which}.png`));
  } catch {
    return null;
  }
}

export async function listReports(limit = 20): Promise<Pick<Report, "id" | "createdAt" | "score" | "input" | "page">[]> {
  try {
    const ids = await readdir(path.join(ROOT, "reports"));
    const withTime = await Promise.all(ids.map(async (id) => ({ id, t: (await stat(path.join(ROOT, "reports", id))).mtimeMs })));
    withTime.sort((a, b) => b.t - a.t);
    const out = [];
    for (const { id } of withTime.slice(0, limit)) {
      const r = await loadReport(id);
      if (r) out.push({ id: r.id, createdAt: r.createdAt, score: r.score, input: r.input, page: r.page });
    }
    return out;
  } catch {
    return [];
  }
}
