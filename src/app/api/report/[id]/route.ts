import { loadReport } from "@/engine/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await loadReport(id).catch(() => null);
  if (!r) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(r);
}
