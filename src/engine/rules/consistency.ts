/**
 * Measured consistency rules: the things a front-end engineer notices in the
 * first ten seconds. Alignment, spacing, type scale, radii, padding.
 *
 * Thresholds adapted from UXly (MIT, github.com/asynkron/UXly) and Impeccable
 * (Apache-2.0, github.com/pbakaus/impeccable). See NOTICES.md.
 */
import type { El, Finding, Snapshot } from "../types";
import { byIndex, childrenOf, distinct, hasBg, hasBorder, hasShadow, isPanel, label, median, mk, overlap1D, round, ancestors } from "./util";

const CITE_UXLY = "Thresholds from UXly (MIT)";
const SVG_TAGS = new Set(["svg", "path", "line", "circle", "rect", "ellipse", "polygon", "polyline", "g", "use", "defs", "mask", "clippath", "text", "tspan"]);

export function consistencyRules(snap: Snapshot): Finding[] {
  const out: Finding[] = [];
  const kids = childrenOf(snap);
  const idx = byIndex(snap);
  out.push(...misalignedSiblings(kids));
  out.push(...unevenGaps(kids));
  out.push(...headingDrift(snap, idx));
  out.push(...flatHierarchy(snap));
  out.push(...radiusSprawl(snap));
  out.push(...crampedPadding(snap, kids));
  out.push(...stretchedRowCards(snap, kids));
  return out;
}

/* ---------- misaligned siblings (UXly analyzeSiblingAlignment) ---------- */
function misalignedSiblings(kids: Map<number, El[]>): Finding[] {
  const out: Finding[] = [];
  const T_MIN = 2, T_MAX = 3;
  const seen = new Set<string>();
  for (const [, group] of kids) {
    const g = group.filter((e) => !SVG_TAGS.has(e.tag) && e.r.w >= 4 && e.r.h >= 4);
    if (g.length < 2 || g.length > 60) continue;
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        const a = g[i].r, b = g[j].r;
        const yOv = overlap1D(a.y, a.y + a.h, b.y, b.y + b.h);
        if (yOv >= 0.5 * Math.min(a.h, b.h)) {
          const top = Math.abs(a.y - b.y), bot = Math.abs(a.y + a.h - (b.y + b.h));
          const centered = Math.abs(a.h - b.h) > 1 && top > 0 && bot > 0 && Math.abs(top - bot) <= 1;
          if (top >= T_MIN && top <= T_MAX && !centered) {
            const key = `t${g[i].i}-${g[j].i}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(mk({
              rule: "misaligned-siblings", source: "squint", category: "consistency", severity: "warn", confidence: "measured",
              title: "Row items are off by a few pixels",
              evidence: `${label(g[i])} and ${label(g[j])} sit in the same row but their top edges differ by ${round(top, 1)}px (${round(a.y)} vs ${round(b.y)}). 1px is sub-pixel noise; 2–3px is a mistake, not a decision.`,
              fix: "Align them on the same axis: use align-items on the parent, or give both the same margin-top. If the offset is intentional, make it ≥ 8px so it reads as deliberate.",
              rects: [a, b], citation: CITE_UXLY, data: { offset: top },
            }));
          }
        }
        const xOv = overlap1D(a.x, a.x + a.w, b.x, b.x + b.w);
        if (xOv >= 0.5 * Math.min(a.w, b.w)) {
          const left = Math.abs(a.x - b.x), right = Math.abs(a.x + a.w - (b.x + b.w));
          const centered = Math.abs(a.w - b.w) > 1 && left > 0 && right > 0 && Math.abs(left - right) <= 1;
          if (left >= T_MIN && left <= T_MAX && !centered) {
            const key = `l${g[i].i}-${g[j].i}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(mk({
              rule: "misaligned-siblings", source: "squint", category: "consistency", severity: "warn", confidence: "measured",
              title: "Stacked items are off by a few pixels",
              evidence: `${label(g[i])} and ${label(g[j])} are stacked but their left edges differ by ${round(left, 1)}px.`,
              fix: "Give both the same left margin/padding, or put them in the same column container.",
              rects: [a, b], citation: CITE_UXLY, data: { offset: left },
            }));
          }
        }
      }
    }
  }
  // Collapse findings with identical evidence (e.g. repeated decorative rows) into one.
  const seenEv = new Map<string, Finding>();
  for (const f of out) {
    const key = f.evidence.replace(/\d+/g, "#");
    const prev = seenEv.get(key);
    if (prev) { prev.data = { ...prev.data, count: ((prev.data?.count as number) || 1) + 1 }; prev.rects = [...(prev.rects || []), ...(f.rects || [])].slice(0, 12); }
    else seenEv.set(key, f);
  }
  return [...seenEv.values()].map((f) => ((f.data?.count as number) > 1 ? { ...f, title: `${f.title} (×${f.data!.count})` } : f)).slice(0, 8);
}

/* ---------- uneven gaps between repeated items (UXly analyzeRepeatedItemGaps) ---------- */
function unevenGaps(kids: Map<number, El[]>): Finding[] {
  const out: Finding[] = [];
  for (const [, group] of kids) {
    const byTag = new Map<string, El[]>();
    for (const e of group) {
      if (!byTag.has(e.tag)) byTag.set(e.tag, []);
      byTag.get(e.tag)!.push(e);
    }
    for (const [, items] of byTag) {
      if (items.length < 3) continue;
      const mw = items.reduce((s, e) => s + e.r.w, 0) / items.length;
      const mh = items.reduce((s, e) => s + e.r.h, 0) / items.length;
      const similar = items.filter((e) => Math.abs(e.r.w - mw) <= 0.2 * mw && Math.abs(e.r.h - mh) <= 0.2 * mh);
      if (similar.length < 3) continue;
      const ySpread = Math.max(...similar.map((e) => e.r.y)) - Math.min(...similar.map((e) => e.r.y));
      const xSpread = Math.max(...similar.map((e) => e.r.x)) - Math.min(...similar.map((e) => e.r.x));
      const vertical = ySpread >= xSpread;
      const sorted = [...similar].sort((a, b) => (vertical ? a.r.y - b.r.y : a.r.x - b.r.x));
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const p = sorted[i - 1].r, c = sorted[i].r;
        gaps.push(vertical ? c.y - (p.y + p.h) : c.x - (p.x + p.w));
      }
      const med = median(gaps);
      if (med > 100 || gaps.some((g) => g < -5)) continue;
      const maxDev = Math.max(...gaps.map((g) => Math.abs(g - med)));
      const mn = Math.min(...gaps), mx = Math.max(...gaps);
      if (mn > 0 && mx / mn > 10) continue;
      if (maxDev > 2 * Math.max(med, 1)) continue;
      if (maxDev > 2) {
        out.push(mk({
          rule: "uneven-gaps", source: "squint", category: "consistency", severity: "warn", confidence: "measured",
          title: `Uneven spacing between ${sorted.length} repeated ${sorted[0].tag} items`,
          evidence: `Gaps along the ${vertical ? "vertical" : "horizontal"} axis are ${gaps.map((g) => round(g)).join(", ")}px (median ${round(med)}px, worst deviation ${round(maxDev)}px).`,
          fix: "Use a single gap value on the container (flex/grid gap) instead of per-item margins.",
          rects: sorted.map((e) => e.r), citation: CITE_UXLY, data: { gaps, median: med },
        }));
      }
    }
  }
  return out.slice(0, 6);
}

/* ---------- same-level headings at different sizes (the “font on the right is bigger” finding) ---------- */
function headingDrift(snap: Snapshot, idx: Map<number, El>): Finding[] {
  const out: Finding[] = [];
  const NAVISH = new Set(["nav", "footer", "aside", "header"]);
  const byLevel = new Map<number, El[]>();
  for (const h of snap.headings) {
    const e = idx.get(h.i);
    if (!e || !e.tlen || !h.text.trim()) continue;
    const anc = ancestors(e, idx);
    if (anc.some((a) => NAVISH.has(a.tag))) continue; // nav/footer headings legitimately differ
    if (!byLevel.has(h.level)) byLevel.set(h.level, []);
    byLevel.get(h.level)!.push(e);
  }
  for (const [level, hs] of byLevel) {
    if (hs.length < 2) continue;
    const sizes = distinct(hs.map((h) => h.s.fontSize), 0.6);
    if (sizes.length < 2) continue;
    const min = sizes[0], max = sizes[sizes.length - 1];
    if (max / min < 1.1) continue;
    const small = hs.find((h) => Math.abs(h.s.fontSize - min) < 0.6)!;
    const big = hs.find((h) => Math.abs(h.s.fontSize - max) < 0.6)!;
    const weights = distinct(hs.map((h) => h.s.fontWeight), 50);
    const name = (e: El) => (snap.headings.find((h) => h.i === e.i)?.text || e.text || e.cls || `<${e.tag}>`).slice(0, 50);
    out.push(mk({
      rule: "heading-size-drift", source: "squint", category: "consistency", severity: max / min >= 1.2 ? "error" : "warn", confidence: "measured",
      title: `h${level} headings render at ${sizes.length} different sizes`,
      evidence: `“${name(big)}” is ${round(max)}px while “${name(small)}” is ${round(min)}px (${round(max / min, 2)}×). Sizes seen: ${sizes.map((s) => round(s)).join(", ")}px${weights.length > 1 ? `; weights: ${weights.join(", ")}` : ""}. Same semantic level should get the same treatment.`,
      fix: `Pick one size for h${level} and set it once in CSS. If one of these is really a sub-heading, change its tag instead of its size.`,
      rects: [big.r, small.r], citation: "UICrit: elements at the same level of hierarchy should get similar graphic treatment (Duan et al., UIST '24)",
      data: { sizes, level },
    }));
  }
  return out;
}

/* ---------- flat type hierarchy (Impeccable flat-type-hierarchy) ---------- */
function flatHierarchy(snap: Snapshot): Finding[] {
  const roles = new Map<string, number[]>();
  for (const e of snap.els) {
    if (!e.text) continue;
    const role = /^h[1-6]$/.test(e.tag) ? e.tag : ["p", "li", "td", "dd", "blockquote"].includes(e.tag) ? "body" : "";
    if (!role) continue;
    if (e.s.fontSize < 8 || e.s.fontSize >= 200) continue;
    if (!roles.has(role)) roles.set(role, []);
    roles.get(role)!.push(e.s.fontSize);
  }
  if (roles.size < 3) return [];
  const dom = [...roles.entries()].map(([role, sizes]) => ({ role, size: median(sizes) })).sort((a, b) => a.size - b.size);
  const ladder = dom.map((d) => d.size);
  let largest = 1;
  for (let i = 1; i < ladder.length; i++) largest = Math.max(largest, ladder[i] / ladder[i - 1]);
  if (largest >= 1.25) return [];
  return [mk({
    rule: "flat-type-hierarchy", source: "squint", category: "consistency", severity: "warn", confidence: "measured",
    title: "Type scale is flat: headings barely differ from body text",
    evidence: `Dominant sizes — ${dom.map((d) => `${d.role}: ${round(d.size)}px`).join(", ")}. The largest step between adjacent roles is ${round(largest, 2)}×; a readable scale steps by at least 1.25×.`,
    fix: "Choose a modular scale (e.g. 16 / 20 / 25 / 31 / 39px) and assign each heading level a step. Hierarchy is what lets a reader skim.",
    citation: "Impeccable flat-type-hierarchy (Apache-2.0); Ladders eye-tracking: clear headings drive the 7-second scan",
  })];
}

/* ---------- border radius sprawl (UXly analyzeRoundedBorderSprawl) ---------- */
function radiusSprawl(snap: Snapshot): Finding[] {
  const SKIP = new Set(["span", "a", "button", "input", "img", "svg", "select", "textarea"]);
  const radii: number[] = [];
  const rounded: El[] = [];
  for (const e of snap.els) {
    if (SKIP.has(e.tag) || e.r.w < 80 || e.r.h < 80) continue;
    if (!(hasBg(e) || hasBorder(e) || hasShadow(e))) continue;
    if (e.s.radiusPx <= 0) continue;
    rounded.push(e);
    radii.push(e.s.radiusPx >= 100 || e.s.radiusPx >= e.r.h / 2 ? 999 : e.s.radiusPx);
  }
  const d = distinct(radii, 1);
  const out: Finding[] = [];
  if (d.length > 4) {
    out.push(mk({
      rule: "radius-sprawl", source: "squint", category: "consistency", severity: "warn", confidence: "measured",
      title: `${d.length} different corner radii on panels`,
      evidence: `Radii in use on ≥80px panels: ${d.map((r) => (r === 999 ? "pill" : `${round(r)}px`)).join(", ")}. A system usually needs two or three.`,
      fix: "Define --radius-sm / --radius-md / --radius-lg tokens and use only those.",
      citation: CITE_UXLY, data: { radii: d },
    }));
  }
  if (rounded.length > 20) {
    out.push(mk({
      rule: "rounded-everything", source: "squint", category: "generic", severity: "info", confidence: "measured",
      title: `${rounded.length} rounded panels on one page`,
      evidence: "Rounded corners on every container is one of the ranked vibe-coded tells (#5 in the Reddit corpus).",
      fix: "Round the things that are interactive or elevated; let sections and layout containers stay square.",
      citation: "vibecoded-design-tells (MIT), tell #5",
    }));
  }
  return out;
}

/* ---------- cramped padding (UXly analyzeCrampedPadding, Impeccable cramped-padding) ---------- */
function crampedPadding(snap: Snapshot, kids: Map<number, El[]>): Finding[] {
  const out: Finding[] = [];
  const SKIP = new Set(["span", "a", "b", "i", "em", "strong", "input", "select", "textarea", "td", "th", "tr", "table", "li", "label", "img", "svg", "code"]);
  for (const e of snap.els) {
    if (SKIP.has(e.tag) || e.tag === "body" || e.tag === "html" || e.tag === "main") continue;
    // Must look like a box: a background, or a border on all four sides. A single border-top is a divider.
    const boxy = (hasBg(e) && !/text/.test(e.s.bgClip)) || (e.s.border.every((w) => w > 0) && hasBorder(e));
    if (!boxy) continue;
    if (e.r.w < 60 || e.r.h < 20) continue;
    const ch = kids.get(e.i) || [];
    const hasText = !!e.text || ch.some((c) => c.text && !isPanel(c));
    if (!hasText) continue;
    if (e.s.flex && ch.every((c) => c.inter)) continue;
    const minPad = Math.max(6, 0.5 * e.s.fontSize);
    const below = e.s.pad.filter((p) => p < minPad).length;
    if (below >= 2 && e.s.pad.every((p) => p < 24)) {
      out.push(mk({
        rule: "cramped-padding", source: "squint", category: "consistency", severity: "warn", confidence: "measured",
        title: "Text sits too close to its box edge",
        evidence: `${label(e)} has padding ${e.s.pad.map((p) => round(p)).join("/")}px at ${round(e.s.fontSize)}px text; ${below} sides are under ${round(minPad)}px.`,
        fix: `Give the box at least ${round(minPad)}px on every side (about half the font size).`,
        rects: [e.r], citation: CITE_UXLY,
      }));
    }
  }
  return out.slice(0, 5);
}

/* ---------- row of cards stretched to the tallest one (the stat-tile finding) ---------- */
function stretchedRowCards(snap: Snapshot, kids: Map<number, El[]>): Finding[] {
  const out: Finding[] = [];
  for (const [, group] of kids) {
    const cards = group.filter((e) => isPanel(e) && e.cr);
    if (cards.length < 2 || cards.length > 8) continue;
    // Same row: all tops within 3px and heights within 2px (stretch).
    const top = cards[0].r.y, h = cards[0].r.h;
    if (!cards.every((c) => Math.abs(c.r.y - top) <= 3 && Math.abs(c.r.h - h) <= 2)) continue;
    const contentHs = cards.map((c) => c.cr!.y + c.cr!.h - c.r.y); // content bottom relative to card top
    const tallest = Math.max(...contentHs);
    const shortest = Math.min(...contentHs);
    const fontSize = Math.max(14, median(cards.map((c) => c.s.fontSize)));
    if (tallest - shortest < 3 * fontSize) continue; // ≥ ~3 lines of difference
    const slack = cards.map((c, i) => round(h - contentHs[i]));
    out.push(mk({
      rule: "stretched-row-cards", source: "squint", category: "consistency", severity: "warn", confidence: "measured",
      title: `${cards.length} cards in a row stretched to the tallest one`,
      evidence: `All ${cards.length} are ${round(h)}px tall, but content ends at ${contentHs.map((v) => round(v)).join(", ")}px from the top. Empty space below content: ${slack.join(", ")}px. One card's wrapped text is dictating the height of its siblings.`,
      fix: "Either shorten the long one so they match naturally, align content to the top and accept a little empty space, or use align-items: start so cards hug their content. Avoid a row where two tiles are 60% air.",
      rects: cards.map((c) => c.r), citation: "Gestalt: items given equal size are read as equal weight — empty tiles read as padding",
      data: { height: h, contentHeights: contentHs },
    }));
  }
  return out.slice(0, 4);
}
