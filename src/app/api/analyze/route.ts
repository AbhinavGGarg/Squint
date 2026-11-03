import { analyze } from "@/engine/analyze";
import { cacheKeyForUrl, checkRateLimit, clientIp, kvDel, kvGet, kvSet, kvSetNX, rememberReport } from "@/engine/kv";
import { currentUserId } from "@/auth";
import { loadReport } from "@/engine/store";
import type { PageType } from "@/engine/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const TYPES = new Set<PageType>(["portfolio", "landing", "hackathon", "ecommerce", "docs", "other"]);
const CACHE_TTL = Number(process.env.SQUINT_CACHE_TTL_SEC || 86_400); // 24h
const INFLIGHT_TTL = 90; // seconds a scan may hold the slot (a crashed function never releases it, so keep this short)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  let body: { url?: string; html?: string; pageType?: string; goal?: string; fresh?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const url = (body.url || "").trim();
  const html = (body.html || "").trim();
  if (!url && !html) return Response.json({ error: "Give me a URL or some HTML." }, { status: 400 });
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) return Response.json({ error: "That doesn't look like an http(s) URL." }, { status: 400 });
  if (url && /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|0\.0\.0\.0)/i.test(url) && process.env.VERCEL) {
    return Response.json({ error: "Private and local addresses can't be scanned from the hosted version. Run Squint locally for those." }, { status: 400 });
  }
  if (html.length > 3_000_000) return Response.json({ error: "HTML too large (3 MB max)." }, { status: 413 });
  const pageType = TYPES.has(body.pageType as PageType) ? (body.pageType as PageType) : "other";
  const goal = (body.goal || "").slice(0, 500) || undefined;
  const userId = await currentUserId();

  // 1. Cache: the same URL + page type within 24h returns the existing report instantly.
  const key = url ? cacheKeyForUrl(url, pageType) : null;
  if (key && !body.fresh) {
    const cachedId = await kvGet(key);
    if (cachedId && (await loadReport(cachedId))) {
      if (userId) await rememberReport(userId, cachedId);
      return Response.json({ id: cachedId, cached: true });
    }
  }

  // 2. Rate limit per client, counted only for scans that actually run.
  const ip = clientIp(req);
  const rl = await checkRateLimit(ip);
  if (!rl.ok) return Response.json({ error: rl.reason }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });

  // 3. In-flight dedupe: if someone else is scanning this URL right now, wait for their report.
  const inflightKey = key ? `inflight:${key}` : null;
  if (inflightKey) {
    const won = await kvSetNX(inflightKey, ip, INFLIGHT_TTL);
    if (!won) {
      for (let i = 0; i < 25; i++) {
        await sleep(2000);
        const id = await kvGet(key!);
        if (id) { if (userId) await rememberReport(userId, id); return Response.json({ id, cached: true, shared: true }); }
        if ((await kvGet(inflightKey)) === null) break; // the other scan failed; fall through and run our own
      }
      await kvSetNX(inflightKey, ip, INFLIGHT_TTL);
    }
  }

  try {
    const report = await analyze({ url: url || undefined, html: html || undefined, pageType, goal });
    if (key) await kvSet(key, report.id, CACHE_TTL);
    if (userId) await rememberReport(userId, report.id);
    return Response.json({ id: report.id, score: report.score });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (/RENDER_BUSY/.test(msg)) {
      return Response.json({ error: "Squint is busy right now; try again in half a minute." }, { status: 503, headers: { "retry-after": "30" } });
    }
    const friendly =
      /BLOCKED_BY_BOT_CHECK/.test(msg) ? "That site shows a bot-check page to headless browsers (Cloudflare or similar), so it can't be measured from here. Paste its HTML instead, or run Squint locally."
      : /ERR_NAME_NOT_RESOLVED/.test(msg) ? "That domain doesn't resolve. Check the spelling."
      : /disconnected|ERR_INSUFFICIENT_RESOURCES|Target .*closed|crashed/i.test(msg) ? "That page is heavier than the hosted browser can hold, even with images and video blocked. Paste its HTML instead, or run Squint locally where Chromium has more memory."
      : /ERR_CONNECTION|ERR_TUNNEL|ERR_SSL|net::/.test(msg) ? `Couldn't load that page (${msg.match(/net::[A-Z_]+/)?.[0] || "network error"}).`
      : /Timeout/i.test(msg) ? "The page took too long to load (30s). Heavy sites or ones that wait on third-party scripts can do this; try again or paste the HTML."
      : msg.slice(0, 300);
    return Response.json({ error: friendly }, { status: 502 });
  } finally {
    if (inflightKey) await kvDel(inflightKey);
  }
}
