import { loadReport } from "@/engine/store";
import { grade } from "@/engine/score";

/** Shields-style SVG badge: /api/badge/<id>  → "squint | 73 · C" */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await loadReport(id.replace(/\.svg$/, "")).catch(() => null);
  const score = r?.score;
  const right = score === undefined ? "no report" : `${score} · ${grade(score).letter}`;
  const color = score === undefined ? "#9f9f9f" : score >= 90 ? "#2f7d32" : score >= 75 ? "#4c8c2b" : score >= 60 ? "#b58900" : score >= 40 ? "#d2691e" : "#c8102e";
  const left = "squint";
  const lw = 52, rw = 14 + right.length * 7;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${left}: ${right}">
<title>${left}: ${right}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${lw + rw}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#141414"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><rect width="${lw + rw}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14" fill="#010101" fill-opacity=".3">${left}</text><text x="${lw / 2}" y="13">${left}</text>
<text x="${lw + rw / 2}" y="14" fill="#010101" fill-opacity=".3">${right}</text><text x="${lw + rw / 2}" y="13">${right}</text>
</g></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
