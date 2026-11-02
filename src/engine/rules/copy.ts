/**
 * Copy tells. Phrase lists from Impeccable (Apache-2.0) and halans/ai-pattern-detection
 * (MIT, HIGH tier only — the broad patterns there fire on normal English).
 * The strongest tell per 21st.dev is simply copy that could describe any product;
 * that one needs the judge, this file catches the mechanical signals.
 */
import type { Finding, Snapshot } from "../types";
import { byIndex, mk, round } from "./util";

const BUZZWORDS = ["streamline your", "empower your", "supercharge your", "unleash your", "unleash the power", "leverage the power", "built for the modern", "trusted by leading", "trusted by the world", "best-in-class", "industry-leading", "world-class", "enterprise-grade", "next-generation", "cutting-edge", "transform your business", "revolutionize", "game-changer", "game changing", "mission-critical", "best of breed", "future-proof", "future proof", "seamless experience", "seamlessly integrate", "drive engagement", "drive growth", "drive results", "harness the power", "unlock the power", "unlock your", "take it to the next level", "to the next level", "effortlessly", "all-in-one", "reimagined", "in today's digital age", "in today's fast-paced world", "the future of", "elevate your", "built with love", "made with ❤"];
const PLACEHOLDERS = [/lorem ipsum/i, /\bjohn doe\b/i, /\bjane doe\b/i, /\[(topic|name|company|product|your [a-z ]+)\]/i, /\byour name\b/i, /\bcompany name\b/i, /\bexample\.com\b/i, /\bsarah j(ohnson)?\.?,? (product manager|ceo)/i, /\bacme (corp|inc)/i, /\bplaceholder text\b/i];
const CONTRASTIVE = /\b(?:it['’]s|this is|we['’]re|that['’]s)\s+not\s+(?:just|only|merely|simply)\s+(?:a |an |about )?[^.,;:—–]{2,60}[,;:—–.]\s*(?:it['’]s|this is|we['’]re|that['’]s|but)\s+/giu;
const FILLER_OPENERS = /\b(in today'?s (fast-paced|digital|modern|ever-changing|rapidly evolving) \w+|welcome to (the future|a new era|the next generation)|imagine a world|are you tired of|say goodbye to|say hello to|meet your new|the (ultimate|all-in-one|smarter) way to)\b/gi;
const WHETHER_YOURE = /\bwhether you'?re (a |an )?[^.,;]{3,40},? or (a |an )?[^.,;]{3,40}/gi;
const FORMULAIC_CLOSERS = /\b(ready to (get started|transform|take the leap|level up)|what are you waiting for|join (thousands|hundreds|millions) of|start your (free )?(trial|journey) today|the future is (here|now))\b/gi;
const FAKE_PROOF = /\b(trusted by|loved by|join|used by)\s+(over\s+)?\d[\d,.]*\s?[kKmM+]*\+?\s+(users|teams|companies|developers|customers|businesses|founders|students)\b|\b4\.[5-9]\s?\/\s?5\b|\b(99\.9+%)\s+uptime\b/gi;
const GENERIC_H1 = /\b(unlock|transform|supercharge|elevate|empower|reimagine|revolutioni[sz]e|seamless|effortless|next level|all-in-one|the future of|smarter|faster|better|your (?:ultimate|all-in-one|complete))\b/i;

export function copyRules(snap: Snapshot): Finding[] {
  const out: Finding[] = [];
  const text = snap.text || "";
  const lower = text.toLowerCase();
  const idx = byIndex(snap);

  // Buzzwords
  const hits: string[] = [];
  for (const phrase of BUZZWORDS) {
    let from = 0;
    while (hits.length < 40) {
      const at = lower.indexOf(phrase, from);
      if (at < 0) break;
      hits.push(text.slice(Math.max(0, at - 18), Math.min(text.length, at + phrase.length + 18)).trim());
      from = at + phrase.length;
    }
  }
  if (hits.length) {
    out.push(mk({
      rule: "marketing-buzzwords", source: "squint", category: "copy", severity: hits.length >= 3 ? "warn" : "info", confidence: "measured",
      title: `${hits.length} marketing buzzword${hits.length > 1 ? "s" : ""}`,
      evidence: hits.slice(0, 4).map((h) => `“…${h}…”`).join(" · "),
      fix: "Replace each with the specific thing: what it does, for whom, with a number if you have one. 'Streamline your workflow' → 'Turns a 40-minute export into a button.'",
      citation: "Impeccable marketing-buzzword list (Apache-2.0)", data: { hits },
    }));
  }

  // Em-dash density (Impeccable: ≥8 and ≤500 chars/dash; Slopdar: ≥4 and >1.2 per 1000)
  const dashes = (text.match(/—/g) || []).length;
  const per1k = (dashes / Math.max(1, text.length)) * 1000;
  if ((dashes >= 8 && text.length / dashes <= 500) || (dashes >= 4 && per1k > 1.2)) {
    out.push(mk({
      rule: "em-dash-density", source: "squint", category: "copy", severity: "info", confidence: "measured",
      title: `${dashes} em dashes in ${round(text.length / 1000, 1)}k characters`,
      evidence: `${round(per1k, 1)} per 1,000 characters. Humans use them; generated copy uses them in nearly every paragraph, and readers have learned to notice.`,
      fix: "Keep the ones that do work; turn the rest into commas, periods, or parentheses.",
      citation: "Impeccable em-dash-overuse; Slopdar em-dash signal; HN thread",
    }));
  }

  // "It's not just X, it's Y"
  const reframes = [...text.matchAll(CONTRASTIVE)].map((m) => m[0].trim());
  if (reframes.length) {
    out.push(mk({
      rule: "contrastive-reframe", source: "squint", category: "copy", severity: "warn", confidence: "measured",
      title: `“It's not just X, it's Y” (${reframes.length})`,
      evidence: reframes.slice(0, 3).map((r) => `“${r}…”`).join(" · "),
      fix: "Say the Y directly. The negation adds drama and removes information.",
      citation: "halans/ai-pattern-detection contrastive-reframe (MIT), HIGH tier",
    }));
  }

  // Filler openers, "whether you're", formulaic closers, fake social proof
  const pat = (re: RegExp) => [...text.matchAll(re)].map((m) => m[0]).slice(0, 4);
  const openers = pat(FILLER_OPENERS), whether = pat(WHETHER_YOURE), closers = pat(FORMULAIC_CLOSERS), proof = pat(FAKE_PROOF);
  if (openers.length + closers.length) {
    out.push(mk({
      rule: "formulaic-copy", source: "squint", category: "copy", severity: openers.length + closers.length >= 2 ? "warn" : "info", confidence: "measured",
      title: `Formulaic ${openers.length ? "opener" : ""}${openers.length && closers.length ? " and " : ""}${closers.length ? "closer" : ""}`,
      evidence: [...openers, ...closers].map((x) => `“${x}”`).join(" · "),
      fix: "Open with the specific thing the product does; close with the specific next step. Both are places where a template sentence is doing the job of a real one.",
      citation: "slop-detect filler_openers / formulaic_closers",
    }));
  }
  if (whether.length) {
    out.push(mk({
      rule: "whether-youre", source: "squint", category: "copy", severity: "info", confidence: "measured",
      title: `“Whether you're X or Y” (${whether.length})`,
      evidence: whether.map((x) => `“${x}”`).join(" · "),
      fix: "Pick the one audience you actually built this for and address them.",
      citation: "slop-detect whether_youre",
    }));
  }
  if (proof.length) {
    out.push(mk({
      rule: "unsourced-social-proof", source: "squint", category: "copy", severity: "warn", confidence: "heuristic",
      title: `Social proof with no source (${proof.length})`,
      evidence: proof.map((x) => `“${x}”`).join(" · ") + ". Round numbers of users, 4.9/5 ratings and 99.9% uptime on a new product are the template's defaults.",
      fix: "Use a number you can link to, or none. One true sentence beats three impressive ones.",
      citation: "slop-detect structural_fake_social_proof; 21st.dev tell #4",
    }));
  }

  // Placeholders
  const ph = PLACEHOLDERS.map((re) => text.match(re)?.[0]).filter(Boolean) as string[];
  if (ph.length) {
    out.push(mk({
      rule: "placeholder-content", source: "squint", category: "copy", severity: "error", confidence: "measured",
      title: `Placeholder content still on the page`,
      evidence: ph.map((p) => `“${p}”`).join(", "),
      fix: "Replace with real names, real testimonials or nothing. A fake testimonial is worse than none.",
      citation: "halans placeholder-template; 21st.dev tell #4 (stock imagery / non-customers)",
    }));
  }

  // Generic h1
  const h1 = snap.headings.find((h) => h.level === 1);
  if (h1 && GENERIC_H1.test(h1.text) && !/\d/.test(h1.text)) {
    const e = idx.get(h1.i);
    out.push(mk({
      rule: "generic-headline", source: "squint", category: "copy", severity: "warn", confidence: "heuristic",
      title: "Headline could be on any site in the category",
      evidence: `h1: “${h1.text}”. No product name, no number, no specific noun. 21st.dev's five-minute test: cover the logo; if the copy still works for a competitor, it isn't yours.`,
      fix: "Write one specific claim: what it is, for whom, and the one thing it does that others don't. Specific beats clever.",
      rects: e ? [e.r] : undefined, citation: "21st.dev: generic copy is the strongest tell",
    }));
  }

  return out;
}
