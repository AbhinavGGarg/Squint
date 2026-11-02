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
  return out;
}
