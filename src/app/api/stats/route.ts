import { kvGet } from "@/engine/kv";

export const runtime = "nodejs";

/** Owner-only counters: GET /api/stats with header x-squint-token (or ?token=) set to SQUINT_ADMIN_TOKEN. */
export async function GET(req: Request) {
  const token = process.env.SQUINT_ADMIN_TOKEN;
  const given = req.headers.get("x-squint-token") || new URL(req.url).searchParams.get("token");
  if (!token || given !== token) return Response.json({ error: "not found" }, { status: 404 });
  const days: Record<string, number> = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    days[d] = Number((await kvGet(`stats:scans:${d}`)) || 0);
  }
  const types: Record<string, number> = {};
  for (const t of ["portfolio", "landing", "hackathon", "ecommerce", "docs", "other"]) types[t] = Number((await kvGet(`stats:type:${t}`)) || 0);
  return Response.json({ scansTotal: Number((await kvGet("stats:scans")) || 0), scansByDay: days, scansByType: types, note: "Scans that actually rendered; cached repeats are not counted. Visits are in Vercel Analytics." });
}
