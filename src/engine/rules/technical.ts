/**
 * Technical hygiene from the raw HTML: the things lightsite-style tools score and
 * people share. Cheap, deterministic, and they decide how a link unfurls.
 */
import type { Finding, Snapshot } from "../types";
import { mk } from "./util";

export function technicalRules(html: string, snap: Snapshot): Finding[] {
  const out: Finding[] = [];
  const head = html.slice(0, 200_000);
  const meta = (name: string) => {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i");
    const m = head.match(re);
    return m ? (m[1] ?? m[2] ?? "").trim() : null;
  };
  const title = (head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
  const description = meta("description");
  const ogImage = meta("og:image");
  const ogTitle = meta("og:title");
  const canonical = /<link[^>]+rel=["']canonical["']/i.test(head);
  const jsonld = /<script[^>]+type=["']application\/ld\+json["']/i.test(head);
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(head);
  const lang = /<html[^>]+lang=["'][a-z]{2}/i.test(head);
  const favicon = /<link[^>]+rel=["'][^"']*icon[^"']*["']/i.test(head);
  const h1s = snap.headings.filter((h) => h.level === 1).length;

  const missing: string[] = [];
  if (!title) missing.push("<title>");
  else if (title.length > 65) missing.push(`title is ${title.length} chars (cuts off ~60)`);
  if (!description) missing.push("meta description");
  if (!ogImage) missing.push("og:image");
  if (!ogTitle) missing.push("og:title");
  if (!canonical) missing.push("canonical");
  if (!viewport) missing.push("viewport meta");
  if (!lang) missing.push("html lang");
  if (!favicon) missing.push("favicon");

  if (!ogImage || !description) {
    out.push(mk({
      rule: "link-preview", source: "squint", category: "quality", severity: !ogImage ? "warn" : "info", confidence: "measured",
      title: !ogImage ? "Links to this page unfurl as a blank card" : "Links to this page unfurl without a description",
      evidence: `${!ogImage ? "No og:image. " : ""}${!description ? "No meta description. " : ""}${!ogTitle ? "No og:title. " : ""}Every share on iMessage, Discord, Slack, X and LinkedIn renders from these tags.`,
      fix: "Add <meta property=\"og:image\"> (1200×630), <meta property=\"og:title\"> and <meta name=\"description\"> with one specific sentence. In Next.js, export `metadata` from the page.",
      citation: "Open Graph protocol",
    }));
  }
  const rest = missing.filter((m) => !/og:image|og:title|meta description/.test(m));
  if (rest.length) {
    out.push(mk({
      rule: "head-hygiene", source: "squint", category: "quality", severity: rest.some((m) => /title|viewport/.test(m)) ? "warn" : "info", confidence: "measured",
      title: `Head is missing: ${rest.join(", ")}`,
      evidence: `${jsonld ? "Has JSON-LD." : "No JSON-LD structured data either, so AI search engines have nothing to cite."} ${h1s === 1 ? "One h1, good." : h1s === 0 ? "No h1." : `${h1s} h1 elements; use one.`}`,
      fix: "Ten minutes of <head> work: title under 60 chars, canonical URL, lang attribute, favicon, and an Organization or WebSite JSON-LD block.",
      citation: "slop-detect AEO axis; lightsite checks",
    }));
  } else if (h1s !== 1) {
    out.push(mk({
      rule: "h1-count", source: "squint", category: "quality", severity: "info", confidence: "measured",
      title: h1s === 0 ? "No h1 on the page" : `${h1s} h1 elements`,
      evidence: "Screen readers and search engines use the h1 as the page's name.",
      fix: "Exactly one h1, saying what the page is.",
    }));
  }
  out.push(...builderSignature(html, snap, title));
  return out;
}

/* ---------- the builder left its name on the page ---------- */
/**
 * The most measurable "nobody made a decision" signal there is: the page still carries the
 * tool's own badge, the tool's default <title>, the tool's default OG image, or the scaffold's
 * favicon. None of these can survive an afternoon of editing. Each line is a plain string match
 * on the served HTML, so this is measured, not inferred.
 */
function builderSignature(html: string, snap: Snapshot, title: string): Finding[] {
  const h = { title };
  const head = html.slice(0, 300_000);
  const hits: { what: string; tool: string; kind: "badge" | "default" }[] = [];
  const add = (cond: boolean, what: string, tool: string, kind: "badge" | "default") => { if (cond) hits.push({ what, tool, kind }); };
  const bodyText = snap.text || "";
  // Badges the builders inject ("Edit with Lovable", "Built with v0", "Made in Framer/Bolt/Webflow")
  add(/id=["']lovable-badge/i.test(html) || /edit with lovable/i.test(bodyText), "“Edit with Lovable” badge", "Lovable", "badge");
  add(/built with v0\b/i.test(bodyText), "“Built with v0” badge", "v0", "badge");
  add(/made in bolt|built with bolt/i.test(bodyText), "“Made in Bolt” badge", "Bolt", "badge");
  add(/made in framer|framer-badge|data-framer-badge/i.test(html), "“Made in Framer” badge", "Framer", "badge");
  add(/made in webflow|w-webflow-badge/i.test(html), "“Made in Webflow” badge", "Webflow", "badge");
  add(/built with base44|base44\.app/i.test(html), "“Built with Base44” badge", "Base44", "badge");
  add(/data-lov-id=|data-component-path=/i.test(html), "Lovable's development attributes (data-lov-id) still in the markup", "Lovable", "badge");
  // Defaults nobody changed
  add(/lovable\.dev\/opengraph-image/i.test(head) || /\/opengraph-image-p98pqg\.png/i.test(head), "Lovable's default og:image (the share card is Lovable's, not yours)", "Lovable", "default");
  add(/^(lovable app|lovable project|lovable generated project)$/i.test(h.title), `default <title> “${h.title}”`, "Lovable", "default");
  add(/^(v0 app|create next app|next\.js app)$/i.test(h.title), `default <title> “${h.title}”`, "Next.js scaffold", "default");
  add(/^(vite \+ react( \+ ts)?|vite app|react app)$/i.test(h.title), `default <title> “${h.title}”`, "Vite scaffold", "default");
  add(/^(my (v0 )?project|untitled|new project|project)$/i.test(h.title), `default <title> “${h.title}”`, "the scaffold", "default");
  add(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["'][^"']*\/vite\.svg["']/i.test(head), "Vite's default favicon", "Vite scaffold", "default");
  add(/content=["']Lovable Generated Project["']/i.test(head), "“Lovable Generated Project” in the meta description", "Lovable", "default");
  add(/content=["']Create Next App["']|Generated by create next app/i.test(head), "“Generated by create next app” in the meta description", "Next.js scaffold", "default");
  if (!hits.length) return [];
  const tools = [...new Set(hits.map((x) => x.tool))];
  const defaults = hits.filter((x) => x.kind === "default");
  return [mk({
    rule: "builder-signature", source: "squint", category: "generic", severity: "error", confidence: "measured",
    title: defaults.length
      ? `Shipped with ${tools.join(" and ")}'s defaults still on it`
      : `${tools.join(" and ")}'s badge is still on the page`,
    evidence: `${hits.map((x) => x.what).join("; ")}. ${defaults.length ? "A default title or share image means nobody touched the first thing a visitor sees in a link preview." : "The builder's badge tells every visitor who really made the page."}`,
    fix: defaults.length
      ? "Set your own <title>, meta description and og:image (1200×630), replace the favicon, then remove the badge. Fifteen minutes, and the page stops announcing it was generated."
      : "Remove the badge (most builders have a toggle in project settings; otherwise delete the element) and check the <head> while you're there.",
    citation: "Squint: the one tell that is a fact, not a style",
    data: { hits },
  })];
}
