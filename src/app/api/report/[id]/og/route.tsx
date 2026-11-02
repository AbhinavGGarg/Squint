import { ImageResponse } from "next/og";
import { loadReport, loadScreenshot } from "@/engine/store";
import { grade } from "@/engine/score";

export const runtime = "nodejs";

/** Open Graph card for a report: score, grade, title and the first screen. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await loadReport(id).catch(() => null);
  if (!r) return new Response("not found", { status: 404 });
  const shot = await loadScreenshot(id, "viewport").catch(() => null);
  const img = shot ? `data:image/png;base64,${shot.toString("base64")}` : null;
  const g = grade(r.score);
  const counts = { error: 0, warn: 0 };
  for (const f of r.findings) if (f.severity !== "info") counts[f.severity]++;
  const title = (r.page.title || r.input.url || "Pasted HTML").slice(0, 70);
  const host = r.input.url ? new URL(r.input.url).hostname : "";
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", background: "#ffffff", color: "#141414", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560, padding: "48px 40px 40px 56px", borderRight: "1px solid #e2e2e2" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", fontSize: 22, fontWeight: 700 }}><span>Squint</span><span style={{ color: "#6a6a6a", fontWeight: 400, marginLeft: 10 }}>the squint test, automated</span></div>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 600, marginTop: 44, lineHeight: 1.15 }}>{title}</div>
            {host && <div style={{ display: "flex", fontSize: 20, color: "#6a6a6a", marginTop: 10 }}>{host}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <div style={{ display: "flex", fontSize: 150, fontWeight: 700, lineHeight: 1, letterSpacing: -6 }}>{r.score}</div>
              <div style={{ display: "flex", fontSize: 36, color: "#6a6a6a", marginLeft: 8, marginBottom: 18 }}>/100</div>
            </div>
            <div style={{ display: "flex", fontSize: 24, marginTop: 8 }}><b style={{ marginRight: 10 }}>{g.letter}</b><span>{`${g.word} · ${counts.error} errors, ${counts.warn} warnings`}</span></div>
          </div>
        </div>
        <div style={{ display: "flex", flex: 1, background: "#f4f4f2", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} width={640} height={400} style={{ objectFit: "cover", objectPosition: "top", border: "1px solid #c8c8c8" }} alt="" />
          ) : (
            <div style={{ display: "flex", fontSize: 24, color: "#6a6a6a" }}>no screenshot</div>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
