import type { Browser } from "playwright-core";
import { SNAPSHOT_SCRIPT } from "./snapshot.generated";
import type { Snapshot } from "./types";

export interface RenderInput {
  url?: string;
  html?: string;
  viewport?: { width: number; height: number };
  timeoutMs?: number;
  /** Second render inside the same request (the mobile pass): keep the browser we already have. */
  reuseBrowser?: boolean;
}

export interface RenderResult {
  snapshot: Snapshot;
  viewportPng: Buffer;
  fullPng: Buffer;
  html: string;
  finalUrl: string;
}

const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
/**
 * Renderer selection:
 *  - "playwright" (default on a laptop/server): the full `playwright` package with its own Chromium.
 *  - "serverless" (default on Vercel/Lambda): `playwright-core` driving @sparticuz/chromium, a
 *    Chromium build that fits in a serverless function. Override with SQUINT_RENDERER.
 */
const RENDERER = (process.env.SQUINT_RENDERER || (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME ? "serverless" : "playwright")) as "playwright" | "serverless";

// Two lazily-launched browsers: one through the environment's proxy (if any) for
// the public web, one direct for localhost dev servers. Chromium's bypass list
// is unreliable for loopback, so we keep them separate.
const browsers: Record<"proxied" | "direct", Promise<Browser> | null> = { proxied: null, direct: null };
let renders = 0;

async function launch(kind: "proxied" | "direct"): Promise<Browser> {
  const proxy = kind === "proxied" && PROXY ? { server: PROXY } : undefined;
  if (RENDERER === "serverless") {
    const [{ chromium: pw }, sparticuz] = await Promise.all([import("playwright-core"), import("@sparticuz/chromium")]);
    const executablePath = await sparticuz.default.executablePath();
    const b = await pw.launch({ headless: true, executablePath, args: sparticuz.default.args, proxy });
    // @sparticuz/chromium runs --single-process; when its last page closes the whole browser exits.
    // Keep one blank page open for the browser's lifetime so later renders (the mobile pass, the
    // next request on a warm function) find it alive.
    await b.newPage().catch(() => {});
    return b;
  }
  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true, proxy, args: ["--disable-dev-shm-usage"] }) as unknown as Promise<Browser>;
}

async function getBrowser(kind: "proxied" | "direct") {
  if (!browsers[kind]) {
    browsers[kind] = launch(kind);
    browsers[kind]!.then((b) => b.on("disconnected", () => (browsers[kind] = null))).catch(() => (browsers[kind] = null));
  }
  return browsers[kind]!;
}

export function rendererName() {
  return RENDERER === "serverless" ? "playwright-core + @sparticuz/chromium" : "playwright";
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
  const kind = isLocal(input.url) || !PROXY ? "direct" : "proxied";
  let browser = await getBrowser(kind);
  if (!browser.isConnected()) { browsers[kind] = null; browser = await getBrowser(kind); }
  // On serverless a browser that has already served a heavy page is a liability: memory is
  // never returned and the next render fails with "insufficient resources" or a dead
  // screenshot. Give each request a fresh browser there; on a laptop/server, reuse.
  if (RENDERER === "serverless" && renders > 0 && !input.reuseBrowser) {
    browsers[kind] = null;
    await browser.close().catch(() => {});
    browser = await getBrowser(kind);
  }
  renders++;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Squint/0.1",
    reducedMotion: "reduce",
  });
  let onDisconnect: (() => void) | undefined;
  const disconnected = new Promise<never>((_, rej) => {
    onDisconnect = () => rej(new Error("browser disconnected during render"));
    browser.once("disconnected", onDisconnect);
  });
  disconnected.catch(() => {}); // the listener is removed in finally; never let this reject unhandled
  try {
    const page = await context.newPage();
    const work = (async () => {
    if (input.url) {
      const resp = await page.goto(input.url, { waitUntil: "domcontentloaded", timeout });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      await detectBotCheck(page, resp?.status() ?? 200);
      await dismissConsent(page);
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
    })();
    return await Promise.race([work, disconnected]);
  } finally {
    if (onDisconnect) browser.off("disconnected", onDisconnect);
    await context.close().catch(() => {});
  }
}

/** Cloudflare / WAF challenge pages render fine but contain nothing of the real site. Fail loudly. */
async function detectBotCheck(page: import("playwright-core").Page, status: number) {
  const title = (await page.title().catch(() => "")) || "";
  const text = await page.evaluate(() => (document.body?.innerText || "").slice(0, 2000)).catch(() => "");
  const looksBlocked =
    /just a moment|attention required|access denied|verify you are human|checking your browser|enable javascript and cookies|ddos protection|captcha/i.test(title + " " + text) &&
    text.length < 2000;
  if (looksBlocked || status === 403 || status === 429 || status === 503) {
    const words = text.split(/\s+/).filter(Boolean).length;
    if (looksBlocked || words < 80) throw new Error(`BLOCKED_BY_BOT_CHECK (${status}: ${title.slice(0, 60)})`);
  }
}

/** Click the obvious "accept" on consent dialogs and hide leftover overlays so they don't skew measurement. */
async function dismissConsent(page: import("playwright-core").Page) {
  const SELECTORS = [
    "#onetrust-accept-btn-handler", "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", ".cc-btn.cc-dismiss", ".cc-allow",
    "[data-testid='cookie-policy-manage-dialog-accept-button']", "#didomi-notice-agree-button", ".fc-cta-consent", "#truste-consent-button",
    "button#accept-cookies", "button.accept-cookies", "[aria-label*='accept cookies' i]", "[aria-label*='accept all' i]",
  ];
  for (const sel of SELECTORS) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 150 }).catch(() => false)) { await el.click({ timeout: 1000 }).catch(() => {}); await page.waitForTimeout(300); return; }
  }
  // Generic: a visible button inside something named cookie/consent/gdpr whose label says accept/agree/allow/got it.
  const clicked = await page.evaluate(() => {
    const roots = Array.from(document.querySelectorAll("[id*='cookie' i],[class*='cookie' i],[id*='consent' i],[class*='consent' i],[id*='gdpr' i],[class*='gdpr' i],[aria-label*='cookie' i]"));
    for (const root of roots) {
      const btns = Array.from(root.querySelectorAll("button, a[role=button], [role=button]")) as HTMLElement[];
      const b = btns.find((x) => /^(accept( all)?( cookies)?|agree|allow( all)?|got it|ok(ay)?|i understand|continue)$/i.test((x.innerText || "").trim()));
      if (b) { b.click(); return true; }
    }
    return false;
  }).catch(() => false);
  if (clicked) await page.waitForTimeout(300);
  // Whatever is left: hide fixed/sticky consent overlays so the screenshot and the first-screen metrics see the page.
  await page.addStyleTag({ content: "[id*='cookie' i][style*='position: fixed'],[class*='cookie-banner' i],[class*='cookie-consent' i],[class*='cookieconsent' i],[id*='cookie-banner' i],[id*='cookieconsent' i],#onetrust-consent-sdk,#CybotCookiebotDialog,.cc-window{display:none !important}" }).catch(() => {});
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
