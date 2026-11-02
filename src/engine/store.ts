/**
 * Report storage.
 *  - Local (default): JSON + PNGs under ./.squint/reports/<id>/.
 *  - Vercel Blob: when BLOB_READ_WRITE_TOKEN is set (Vercel sets it when you attach a
 *    Blob store to the project). Serverless functions have no durable disk, so this is
 *    what makes /r/<id> links survive on Vercel.
 */
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Report } from "./types";

type Summary = Pick<Report, "id" | "createdAt" | "score" | "input" | "page">;

interface Store {
  name: string;
  save(report: Report, pngs: { viewport: Buffer; full: Buffer }): Promise<void>;
  load(id: string): Promise<Report | null>;
  screenshot(id: string, which: "viewport" | "full"): Promise<Buffer | null>;
  /** A directly fetchable URL for the screenshot, when the store has one (Blob). Lets us skip
   *  proxying multi-MB PNGs through a serverless function (Vercel caps responses at 4.5 MB). */
  screenshotUrl(id: string, which: "viewport" | "full"): Promise<string | null>;
  list(limit: number): Promise<Summary[]>;
  /** Reviewer feedback on a finding: the dataset nobody else has. */
  saveFeedback(fb: Feedback): Promise<void>;
}

export interface Feedback {
  reportId: string;
  findingId: string;
  rule: string;
  verdict: "right" | "wrong" | "missing";
  note?: string;
  url?: string;
  pageType?: string;
  at: string;
}

function checkId(id: string) {
  if (!/^[a-f0-9]{12}$/.test(id)) throw new Error("bad report id");
  return id;
}

/* ---------------- local files ---------------- */
function fileStore(): Store {
  const ROOT = process.env.SQUINT_DATA_DIR || path.join(process.cwd(), ".squint");
  const dir = (id: string) => path.join(ROOT, "reports", checkId(id));
  return {
    name: "files",
    async save(report, pngs) {
      const d = dir(report.id);
      await mkdir(d, { recursive: true });
      await Promise.all([
        writeFile(path.join(d, "report.json"), JSON.stringify(report, null, 2)),
        writeFile(path.join(d, "viewport.png"), pngs.viewport),
        writeFile(path.join(d, "full.png"), pngs.full),
      ]);
    },
    async load(id) {
      try { return JSON.parse(await readFile(path.join(dir(id), "report.json"), "utf8")) as Report; } catch { return null; }
    },
    async screenshot(id, which) {
      try { return await readFile(path.join(dir(id), `${which}.png`)); } catch { return null; }
    },
    async screenshotUrl() { return null; },
    async saveFeedback(fb) {
      const d = path.join(ROOT, "feedback", checkId(fb.reportId));
      await mkdir(d, { recursive: true });
      await writeFile(path.join(d, `${fb.findingId.replace(/[^a-z0-9_-]/gi, "_")}.json`), JSON.stringify(fb, null, 2));
    },
    async list(limit) {
      try {
        const ids = await readdir(path.join(ROOT, "reports"));
        const withTime = await Promise.all(ids.map(async (id) => ({ id, t: (await stat(path.join(ROOT, "reports", id))).mtimeMs })));
        withTime.sort((a, b) => b.t - a.t);
        const out: Summary[] = [];
        for (const { id } of withTime.slice(0, limit)) {
          const r = await this.load(id);
          if (r) out.push({ id: r.id, createdAt: r.createdAt, score: r.score, input: r.input, page: r.page });
        }
        return out;
      } catch { return []; }
    },
  };
}

/* ---------------- Vercel Blob ---------------- */
function blobStore(): Store {
  const key = (id: string, file: string) => `squint/reports/${checkId(id)}/${file}`;
  // Blob URLs are deterministic once addRandomSuffix is false, but the host is per-store,
  // so we resolve it through list() and cache it.
  let base: string | null = null;
  async function urlFor(id: string, file: string): Promise<string | null> {
    const { list } = await import("@vercel/blob");
    if (base) return `${base}/${key(id, file)}`;
    const r = await list({ prefix: key(id, file), limit: 1 });
    const b = r.blobs[0];
    if (!b) return null;
    base = b.url.slice(0, b.url.indexOf(`/${key(id, file)}`));
    return b.url;
  }
  async function fetchBuf(url: string | null): Promise<Buffer | null> {
    if (!url) return null;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return {
    name: "vercel-blob",
    async save(report, pngs) {
      const { put } = await import("@vercel/blob");
      const opts = { access: "public" as const, addRandomSuffix: false, cacheControlMaxAge: 60 * 60 * 24 * 365 };
      const [j] = await Promise.all([
        put(key(report.id, "report.json"), JSON.stringify(report), { ...opts, contentType: "application/json" }),
        put(key(report.id, "viewport.png"), pngs.viewport, { ...opts, contentType: "image/png" }),
        put(key(report.id, "full.png"), pngs.full, { ...opts, contentType: "image/png" }),
      ]);
      base = j.url.slice(0, j.url.indexOf(`/${key(report.id, "report.json")}`));
    },
    async load(id) {
      try {
        const buf = await fetchBuf(await urlFor(id, "report.json"));
        return buf ? (JSON.parse(buf.toString("utf8")) as Report) : null;
      } catch { return null; }
    },
    async screenshot(id, which) {
      try { return await fetchBuf(await urlFor(id, `${which}.png`)); } catch { return null; }
    },
    async screenshotUrl(id, which) {
      try { return await urlFor(id, `${which}.png`); } catch { return null; }
    },
    async saveFeedback(fb) {
      const { put } = await import("@vercel/blob");
      await put(`squint/feedback/${checkId(fb.reportId)}/${fb.findingId.replace(/[^a-z0-9_-]/gi, "_")}.json`, JSON.stringify(fb), { access: "public", addRandomSuffix: false, contentType: "application/json" });
    },
    async list(limit) {
      try {
        const { list } = await import("@vercel/blob");
        const r = await list({ prefix: "squint/reports/", limit: 500 });
        const jsons = r.blobs.filter((b) => b.pathname.endsWith("/report.json")).sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt)).slice(0, limit);
        const out: Summary[] = [];
        for (const b of jsons) {
          const buf = await fetchBuf(b.url);
          if (!buf) continue;
          const rep = JSON.parse(buf.toString("utf8")) as Report;
          out.push({ id: rep.id, createdAt: rep.createdAt, score: rep.score, input: rep.input, page: rep.page });
        }
        return out;
      } catch { return []; }
    },
  };
}

const store: Store = process.env.BLOB_READ_WRITE_TOKEN ? blobStore() : fileStore();
export const storeName = store.name;

export const saveReport = (report: Report, pngs: { viewport: Buffer; full: Buffer }) => store.save(report, pngs);
export const loadReport = (id: string) => store.load(id);
export const loadScreenshot = (id: string, which: "viewport" | "full") => store.screenshot(id, which);
export const screenshotUrl = (id: string, which: "viewport" | "full") => store.screenshotUrl(id, which);
export const listReports = (limit = 20) => store.list(limit);
export const saveFeedback = (fb: Feedback) => store.saveFeedback(fb);
