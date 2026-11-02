import { loadScreenshot } from "@/engine/store";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const which = new URL(req.url).searchParams.get("which") === "viewport" ? "viewport" : "full";
  const png = await loadScreenshot(id, which).catch(() => null);
  if (!png) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" } });
}
