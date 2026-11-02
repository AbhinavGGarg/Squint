import { analyze } from "@/engine/analyze";
import type { PageType } from "@/engine/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const TYPES = new Set<PageType>(["portfolio", "landing", "hackathon", "ecommerce", "docs", "other"]);

export async function POST(req: Request) {
  let body: { url?: string; html?: string; pageType?: string; goal?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const url = (body.url || "").trim();
  const html = (body.html || "").trim();
  if (!url && !html) return Response.json({ error: "Give me a URL or some HTML." }, { status: 400 });
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) return Response.json({ error: "That doesn't look like an http(s) URL." }, { status: 400 });
  if (html.length > 3_000_000) return Response.json({ error: "HTML too large (3 MB max)." }, { status: 413 });
  const pageType = TYPES.has(body.pageType as PageType) ? (body.pageType as PageType) : "other";
  try {
    const report = await analyze({ url: url || undefined, html: html || undefined, pageType, goal: (body.goal || "").slice(0, 500) || undefined });
    return Response.json({ id: report.id, score: report.score });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    const friendly = /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TUNNEL|net::/.test(msg)
      ? `Couldn't load that page from this machine (${msg.match(/net::[A-Z_]+/)?.[0] || "network error"}).`
      : /Timeout/.test(msg) ? "The page took too long to load (30s)." : msg;
    return Response.json({ error: friendly }, { status: 502 });
  }
}
