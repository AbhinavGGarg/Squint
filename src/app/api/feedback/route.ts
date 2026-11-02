import { loadReport, saveFeedback } from "@/engine/store";
import { checkRateLimit, clientIp } from "@/engine/kv";

export async function POST(req: Request) {
  let body: { reportId?: string; findingId?: string; verdict?: string; note?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const { reportId = "", findingId = "", verdict = "", note = "" } = body;
  if (!/^[a-f0-9]{12}$/.test(reportId) || !findingId || !["right", "wrong", "missing"].includes(verdict)) return Response.json({ error: "bad input" }, { status: 400 });
  const rl = await checkRateLimit(`fb:${clientIp(req)}`);
  if (!rl.ok) return Response.json({ error: rl.reason }, { status: 429 });
  const report = await loadReport(reportId);
  if (!report) return Response.json({ error: "not found" }, { status: 404 });
  const finding = findingId === "page" ? undefined : report.findings.find((f) => f.id === findingId);
  if (findingId !== "page" && !finding) return Response.json({ error: "no such finding" }, { status: 404 });
  await saveFeedback({
    reportId, findingId, rule: finding?.rule || "page", verdict: verdict as "right" | "wrong" | "missing",
    note: String(note).slice(0, 500) || undefined, url: report.input.url, pageType: report.input.pageType, at: new Date().toISOString(),
  });
  return Response.json({ ok: true });
}
