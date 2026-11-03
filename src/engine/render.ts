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
  /**
   * Light mode: a second attempt after the page exhausted the browser. Images and media are
   * blocked, the scroll-through and full-page capture are capped. Geometry and copy rules still
   * see the real DOM; container-fill and the first-impression metrics see a page without pictures.
   */
  light?: boolean;
}

export interface RenderResult {
  snapshot: Snapshot;
  viewportPng: Buffer;
  fullPng: Buffer;
  html: string;
  finalUrl: string;
  /** How the page was rendered: "full", or "light" when images/media were blocked. */
  mode: "full" | "light";
  /** Requests the renderer refused to make (trackers, video, chat widgets) on this render. */
  blockedRequests: number;
}

/**
 * Third-party scripts that never change the layout but cost a serverless Chromium dearly:
 * analytics, session replay, chat widgets, ad pixels. Blocked on serverless and in light mode.
 * Consent SDKs are deliberately NOT here: some sites render differently until they load, and
 * dismissConsent() handles them.
 */
const HEAVY_THIRD_PARTY =
  /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|googlesyndication\.com|googleadservices\.com|connect\.facebook\.net|facebook\.com\/tr|hotjar\.com|static\.hotjar\.com|segment\.(io|com)|cdn\.segment\.com|intercom\.io|intercomcdn\.com|widget\.intercom\.io|crisp\.chat|drift\.com|driftt\.com|fullstory\.com|mixpanel\.com|amplitude\.com|clarity\.ms|hs-scripts\.com|hs-analytics\.net|hubspot\.com\/.*\.js|sentry\.io|sentry-cdn\.com|datadoghq(-browser-agent)?\.com|newrelic\.com|nr-data\.net|optimizely\.com|analytics\.tiktok\.com|snap\.licdn\.com|bat\.bing\.com|px\.ads\.linkedin\.com|cdn\.heapanalytics\.com|js\.hsforms\.net|static\.ads-twitter\.com|t\.co\/i\/adsct|plausible\.io|posthog\.com|rudderstack\.com|cdn\.mouseflow\.com|script\.crazyegg\.com|smartlook\.com|vwo\.com|visualwebsiteoptimizer\.com|chatlio|tawk\.to|zdassets\.com|zopim\.com|livechatinc\.com|olark\.com|kustomerapp\.com|app\.link|branch\.io)/i;
/** Resource types that only ever cost memory on a measurement render. */
const BLOCKED_TYPES = new Set(["media", "websocket", "eventsource", "texttrack", "manifest"]);
/** Light mode also drops every raster/vector image except data: URIs (which never cost a request). */
const LIGHT_BLOCKED_TYPES = new Set([...BLOCKED_TYPES, "image"]);

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

/**
 * One render at a time per process. On Vercel's Fluid Compute a warm function serves many
 * requests at once; two Chromiums in one 2 GB function means ERR_INSUFFICIENT_RESOURCES for
 * both, and the "fresh browser" logic below would otherwise close a browser mid-render.
 * Requests queue here instead. More than MAX_INFLIGHT accepted (running + queued) is refused
 * immediately so a burst degrades into fast 503s rather than a pile of timeouts.
 */
let chain: Promise<unknown> = Promise.resolve();
let inflight = 0;
const MAX_INFLIGHT = Number(process.env.SQUINT_MAX_INFLIGHT || 3);
export class RenderBusyError extends Error {
  constructor() { super("RENDER_BUSY: this instance already has " + MAX_INFLIGHT + " scans in flight"); }
}
async function serialized<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= MAX_INFLIGHT) throw new RenderBusyError();
  inflight++;
  const prev = chain;
  let release!: () => void;
  chain = new Promise<void>((r) => (release = r));
  try {
    await prev;
    return await fn();
  } finally {
    inflight--;
    release();
  }
}

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

export function render(input: RenderInput): Promise<RenderResult> {
  return serialized(() => renderInner(input));
}

async function renderInner(input: RenderInput): Promise<RenderResult> {
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
  const light = !!input.light;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Squint/0.1",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  // Serverless Chromium has ~2 GB and one process. Refuse what never changes the layout.
  let blockedRequests = 0;
  if (RENDERER === "serverless" || light) {
    const types = light ? LIGHT_BLOCKED_TYPES : BLOCKED_TYPES;
    await context.route("**/*", (route) => {
      const req = route.request();
      const type = req.resourceType();
      const url = req.url();
      const block =
        (types.has(type) && !url.startsWith("data:")) ||
        ((type === "script" || type === "xhr" || type === "fetch" || type === "other" || type === "ping") && HEAVY_THIRD_PARTY.test(url)) ||
        type === "ping";
      if (block) { blockedRequests++; return route.abort("blockedbyclient"); }
      return route.continue();
    });
  }
  // The scroll-through wakes lazy sections; the full-page capture is the single most expensive
  // call on a long page. Both are capped harder on serverless and harder again in light mode.
  const scrollCap = light ? 6_000 : RENDERER === "serverless" ? 10_000 : 12_000;
  const captureCap = light ? 6_000 : RENDERER === "serverless" ? 12_000 : 24_000;
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
    await page.evaluate(async (cap: number) => {
      const h = document.documentElement.scrollHeight;
      for (let y = 0; y < Math.min(h, cap); y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    }, scrollCap);
    await page.waitForTimeout(250);

    const fullHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)).catch(() => viewport.height);
    const viewportPng = await page.screenshot({ type: "png", fullPage: false, animations: "disabled", caret: "hide" });
    const fullPng = await page.screenshot({
      type: "png", fullPage: true, animations: "disabled", caret: "hide",
      ...(fullHeight > captureCap ? { clip: { x: 0, y: 0, width: viewport.width, height: captureCap } } : {}),
    });
    const snapshot = (await page.evaluate(SNAPSHOT_SCRIPT)) as Snapshot;
    const html = await page.content();
    return { snapshot, viewportPng, fullPng, html, finalUrl: page.url(), mode: light ? "light" as const : "full" as const, blockedRequests };
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
