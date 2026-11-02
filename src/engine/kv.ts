/**
 * Tiny key-value layer for rate limits, the per-URL cache and in-flight dedupe.
 *
 *  - Upstash Redis over REST when configured (Vercel's Upstash integration sets
 *    KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN).
 *  - In-memory fallback otherwise: fine on a laptop, and on Vercel it still limits
 *    abuse per function instance, just not globally.
 *
 * Plain fetch, no SDK.
 */

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const kvBackend = URL_ && TOKEN ? "upstash" : "memory";

async function redis(cmd: (string | number)[]): Promise<unknown> {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`kv ${res.status}`);
  const j = (await res.json()) as { result?: unknown; error?: string };
  if (j.error) throw new Error(`kv: ${j.error}`);
  return j.result;
}

const mem = new Map<string, { v: string; exp: number }>();
function memGet(k: string) {
  const e = mem.get(k);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) { mem.delete(k); return null; }
  return e.v;
}
function memSet(k: string, v: string, ttlSec: number) {
  mem.set(k, { v, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  if (mem.size > 5000) for (const [key, e] of mem) if (e.exp && e.exp < Date.now()) mem.delete(key);
}

export async function kvGet(key: string): Promise<string | null> {
  if (kvBackend === "upstash") {
    try { const r = await redis(["GET", key]); return r == null ? null : String(r); } catch { return memGet(key); }
  }
  return memGet(key);
}

export async function kvSet(key: string, value: string, ttlSec: number): Promise<void> {
  memSet(key, value, ttlSec);
  if (kvBackend === "upstash") {
    try { await redis(["SET", key, value, "EX", ttlSec]); } catch { /* memory already has it */ }
  }
}

/** Set only if absent. Returns true if we won the slot. */
export async function kvSetNX(key: string, value: string, ttlSec: number): Promise<boolean> {
  if (kvBackend === "upstash") {
    try { const r = await redis(["SET", key, value, "EX", ttlSec, "NX"]); return r === "OK"; } catch { /* fall through */ }
  }
  if (memGet(key) !== null) return false;
  memSet(key, value, ttlSec);
  return true;
}

export async function kvDel(key: string): Promise<void> {
  mem.delete(key);
  if (kvBackend === "upstash") { try { await redis(["DEL", key]); } catch { /* ignore */ } }
}

/** Increment a counter that expires ttlSec after its first increment. Returns the new count. */
export async function kvIncr(key: string, ttlSec: number): Promise<number> {
  if (kvBackend === "upstash") {
    try {
      const n = Number(await redis(["INCR", key]));
      if (n === 1) await redis(["EXPIRE", key, ttlSec]);
      return n;
    } catch { /* fall through */ }
  }
  const cur = Number(memGet(key) || 0) + 1;
  const e = mem.get(key);
  mem.set(key, { v: String(cur), exp: e?.exp || Date.now() + ttlSec * 1000 });
  return cur;
}

/* ---------- policies ---------- */

export interface RateLimitResult { ok: boolean; retryAfterSec?: number; reason?: string }

/** 5 scans/min and 60/day per client. */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const perMin = Number(process.env.SQUINT_RATE_PER_MIN || 5);
  const perDay = Number(process.env.SQUINT_RATE_PER_DAY || 60);
  const m = await kvIncr(`rl:m:${ip}`, 60);
  if (m > perMin) return { ok: false, retryAfterSec: 60, reason: `Limit is ${perMin} scans a minute. Try again in a minute.` };
  const d = await kvIncr(`rl:d:${ip}`, 86_400);
  if (d > perDay) return { ok: false, retryAfterSec: 3600, reason: `Limit is ${perDay} scans a day from one address.` };
  return { ok: true };
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

/** Normalise a URL for cache keys: lowercase host, drop hash and tracking params, trailing slash. */
export function cacheKeyForUrl(url: string, pageType: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(p)) u.searchParams.delete(p);
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (s.endsWith("/") && u.pathname === "/" && !u.search) s = s.slice(0, -1);
    return `cache:${pageType}:${s}`;
  } catch {
    return `cache:${pageType}:${url}`;
  }
}
