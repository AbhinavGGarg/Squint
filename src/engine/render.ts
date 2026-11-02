import { chromium, type Browser } from "playwright";
import { SNAPSHOT_SCRIPT } from "./snapshot.generated";
import type { Snapshot } from "./types";

export interface RenderInput {
  url?: string;
  html?: string;
  viewport?: { width: number; height: number };
  timeoutMs?: number;
}

export interface RenderResult {
  snapshot: Snapshot;
  viewportPng: Buffer;
  fullPng: Buffer;
  html: string;
  finalUrl: string;
}

const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
// Two lazily-launched browsers: one through the environment's proxy (if any) for
// the public web, one direct for localhost dev servers. Chromium's bypass list
// is unreliable for loopback, so we keep them separate.
const browsers: Record<"proxied" | "direct", Promise<Browser> | null> = { proxied: null, direct: null };

async function getBrowser(kind: "proxied" | "direct") {
  if (!browsers[kind]) {
    browsers[kind] = chromium.launch({
      headless: true,
      proxy: kind === "proxied" && PROXY ? { server: PROXY } : undefined,
      args: ["--disable-dev-shm-usage"],
    });
    browsers[kind]!.then((b) => b.on("disconnected", () => (browsers[kind] = null)));
  }
  return browsers[kind]!;
}

function isLocal(url?: string) {
  if (!url) return true;
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local");
  } catch {
    return true;
  }
}

export async function render(input: RenderInput): Promise<RenderResult> {
  const viewport = input.viewport ?? { width: 1440, height: 900 };
  const timeout = input.timeoutMs ?? 30_000;
  const browser = await getBrowser(isLocal(input.url) || !PROXY ? "direct" : "proxied");
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Squint/0.1",
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    if (input.url) {
      await page.goto(input.url, { waitUntil: "domcontentloaded", timeout });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    } else if (input.html) {
      await page.setContent(input.html, { waitUntil: "load", timeout });
    } else {
      throw new Error("render: need url or html");
    }
    // Let fonts settle and lazy content paint.
    await page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready).catch(() => {});
    await page.waitForTimeout(400);
    // Trigger lazy-loaded sections by scrolling through, then return to top.
    await page.evaluate(async () => {
      const h = document.documentElement.scrollHeight;
      for (let y = 0; y < Math.min(h, 12_000); y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(250);

    const viewportPng = await page.screenshot({ type: "png", fullPage: false });
    const fullPng = await page.screenshot({ type: "png", fullPage: true });
    const snapshot = (await page.evaluate(SNAPSHOT_SCRIPT)) as Snapshot;
    const html = await page.content();
    return { snapshot, viewportPng, fullPng, html, finalUrl: page.url() };
  } finally {
    await context.close();
  }
}

export async function closeBrowser() {
  for (const kind of ["proxied", "direct"] as const) {
    const p = browsers[kind];
    if (p) {
      browsers[kind] = null;
      await (await p).close();
    }
  }
}
