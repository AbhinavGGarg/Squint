/**
 * Visual fingerprints of generated UI. Thresholds from Impeccable (Apache-2.0),
 * ranking/evidence from vibecoded-design-tells (MIT, Reddit corpus), Fountain
 * Institute's "7 tells", and Slopdar (MIT).
 */
import type { El, Finding, Snapshot } from "../types";
import { byIndex, childrenOf, chroma, hasBg, hasBorder, hsl, isCardLike, label, luminance, mk, parseColor, round } from "./util";

const OVERUSED_FONTS = ["inter", "roboto", "open sans", "lato", "montserrat", "arial", "helvetica", "fraunces", "instrument sans", "instrument serif", "geist", "geist sans", "geist mono", "mona sans", "plus jakarta sans", "space grotesk", "recoleta"];
const SERIF_DISPLAY = ["instrument serif", "fraunces", "playfair display", "playfair", "spectral", "cormorant", "cormorant garamond", "dm serif display", "dm serif text", "newsreader", "lora", "crimson"];
const CREAM_BG = [[250, 248, 245], [245, 241, 232], [243, 238, 227], [253, 251, 247], [247, 243, 236], [250, 250, 249], [255, 251, 235], [254, 252, 232]];
const EMOJI = /^\s*\p{Extended_Pictographic}/u;

export function fingerprintRules(snap: Snapshot): Finding[] {
  const kids = childrenOf(snap);
  const idx = byIndex(snap);
  return [
    ...purplePalette(snap),
    ...gradientText(snap),
    ...glow(snap),
    ...fonts(snap),
    ...emojiIcons(snap, idx),
    ...iconTileStack(snap, kids, idx),
    ...heroThreeCards(snap, kids),
    ...eyebrowChip(snap, kids, idx),
    ...tastefulDefault(snap),
    ...shadcnUntouched(snap),
    ...animationOverload(snap),
  ];
}

/* ---------- AI purple (Impeccable: chroma≥50, hue 260–310 on headings/buttons; gradients 250–320 + blue/pink stop) ---------- */
function isPurple(c: ReturnType<typeof parseColor>, loose = false) {
  if (!c || c.a < 0.2) return false;
  const { h } = hsl(c);
  const ch = chroma(c);
  return loose ? ch >= 30 && h >= 250 && h <= 320 : ch >= 50 && h >= 260 && h <= 310;
}
function gradientStops(bgImage: string) {
  if (!/gradient\(/.test(bgImage)) return [] as NonNullable<ReturnType<typeof parseColor>>[];
  const out: NonNullable<ReturnType<typeof parseColor>>[] = [];
  for (const m of bgImage.matchAll(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi)) {
    const c = parseColor(m[0]);
    if (c) out.push(c);
  }
  return out;
}
function purplePalette(snap: Snapshot): Finding[] {
  const hits: El[] = [];
  let gradients = 0;
  for (const e of snap.els) {
    const big = /^h[1-3]$/.test(e.tag) || e.s.fontSize >= 20;
    if (e.text && big && isPurple(parseColor(e.s.color))) hits.push(e);
    else if ((e.tag === "button" || e.inter) && isPurple(parseColor(e.s.bg))) hits.push(e);
    const stops = gradientStops(e.s.bgImage);
    if (stops.length >= 2 && stops.some((s) => isPurple(s, true)) && stops.some((s) => { const { h } = hsl(s); return chroma(s) >= 30 && ((h >= 180 && h <= 250) || h >= 300 || h <= 20); })) {
      gradients++;
      hits.push(e);
    }
  }
  if (!hits.length || (hits.length < 3 && !gradients)) return []; // one violet logo is a brand, not a tell
  return [mk({
    rule: "ai-purple", source: "squint", category: "generic", severity: hits.length >= 3 ? "warn" : "info", confidence: "measured",
    title: `AI purple${gradients ? " / purple-to-blue gradient" : ""} accent`,
    evidence: `${hits.length} element${hits.length > 1 ? "s" : ""} use a violet/indigo accent (hue 260–310°)${gradients ? `, ${gradients} as a gradient` : ""}, e.g. ${label(hits[0])}. This is the single most-cited vibe-coded tell in the Reddit corpus (#2 overall).`,
    fix: "Pick one base hue that means something for this product and derive the palette from it. If you keep purple, make it a decision: one accent, solid, used sparingly.",
    rects: hits.slice(0, 6).map((h) => h.r), citation: "Impeccable ai-color-palette (Apache-2.0); vibecoded-design-tells #2–3",
  })];
}

function gradientText(snap: Snapshot): Finding[] {
  const hits = snap.els.filter((e) => e.text && /text/.test(e.s.bgClip) && /gradient/.test(e.s.bgImage));
  if (!hits.length) return [];
  return [mk({
    rule: "gradient-text", source: "squint", category: "generic", severity: "warn", confidence: "measured",
    title: `Gradient-filled text (${hits.length})`,
    evidence: `${label(hits[0])} uses background-clip: text with a gradient. Decorative, hurts contrast, and reads as generated.`,
    fix: "Use a solid colour. Emphasis comes from size and weight, not a rainbow.",
    rects: hits.slice(0, 4).map((h) => h.r), citation: "Impeccable gradient-text",
  })];
}

/* ---------- chromatic glow shadows (Impeccable dark-glow) ---------- */
function glow(snap: Snapshot): Finding[] {
  const bodyL = luminance(parseColor(snap.bodyBg) || { r: 255, g: 255, b: 255, a: 1 });
  const hits: { e: El; why: string }[] = [];
  for (const e of snap.els) {
    for (const sh of [e.s.shadow, e.s.textShadow]) {
      if (!sh) continue;
      // split layers on commas outside parens
      for (const layer of sh.split(/,(?![^(]*\))/)) {
        const c = parseColor(layer.match(/rgba?\([^)]*\)/)?.[0]);
        if (!c || chroma(c) < 30) continue;
        const nums = layer.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g)?.map(parseFloat) || [];
        if (nums.length < 3) continue;
        const [ox, oy, blur] = nums;
        if (blur <= 4 || blur * c.a * e.s.opacity < 3) continue;
        if (ox === 0 && oy === 0) hits.push({ e, why: `zero-offset ${round(blur)}px blur in ${layer.match(/rgba?\([^)]*\)/)?.[0]}` });
        else if (bodyL < 0.1) hits.push({ e, why: `coloured ${round(blur)}px blur on a dark background` });
      }
    }
  }
  if (!hits.length) return [];
  return [mk({
    rule: "neon-glow", source: "squint", category: "generic", severity: hits.length >= 3 ? "warn" : "info", confidence: "measured",
    title: `Glowing coloured shadows (${hits.length})`,
    evidence: `${label(hits[0].e)}: ${hits[0].why}. Dark background + neon glow is tell #6 in the Reddit corpus and #2 on the Fountain Institute list.`,
    fix: "Use neutral elevation shadows (black at low alpha, offset downward). Light should come from somewhere.",
    rects: hits.slice(0, 6).map((h) => h.e.r), citation: "Impeccable dark-glow; vibecoded-design-tells #6",
  })];
}

/* ---------- fonts ---------- */
function fonts(snap: Snapshot): Finding[] {
  const out: Finding[] = [];
  const counts = new Map<string, number>();
  for (const e of snap.els) if (e.text) counts.set(e.s.fontFamily.toLowerCase(), (counts.get(e.s.fontFamily.toLowerCase()) || 0) + e.words);
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return out;
  const [primary, share] = sorted[0];
  if (OVERUSED_FONTS.includes(primary) && share / total >= 0.8) {
    out.push(mk({
      rule: "overused-font", source: "squint", category: "generic", severity: "info", confidence: "measured",
      title: `${capital(primary)} for ${round((share / total) * 100)}% of the text`,
      evidence: `Primary family is ${capital(primary)}, one of the fonts generated UIs default to. Fonts seen: ${snap.fonts.slice(0, 5).join(", ")}.`,
      fix: "Not wrong on its own. If everything else is default too, this is the cheapest thing to change: pick one typeface with a point of view for headings and keep the workhorse for body.",
      citation: "Impeccable overused-font; HN thread on vibe-coded tells (Inter everywhere)",
    }));
  }
  return out;
}
const capital = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/* ---------- emoji as icons ---------- */
function emojiIcons(snap: Snapshot, idx: Map<number, El>): Finding[] {
  const hits = snap.els.filter((e) => e.text && EMOJI.test(e.text) && (/^h[1-6]$/.test(e.tag) || e.s.fontSize >= 18 || (idx.get(e.p) && isCardLike(idx.get(e.p)!))));
  if (hits.length < 2) return [];
  return [mk({
    rule: "emoji-as-icons", source: "squint", category: "generic", severity: "warn", confidence: "measured",
    title: `Emoji used as icons (${hits.length})`,
    evidence: `${hits.slice(0, 3).map((h) => `“${h.text.slice(0, 24)}”`).join(", ")}. 🚀✨⚡ in front of headings is tell #7 in the Reddit corpus and #3 on the Fountain Institute list.`,
    fix: "Drop them, or use one consistent icon set at one size. Headings don't need a mascot.",
    rects: hits.slice(0, 6).map((h) => h.r), citation: "vibecoded-design-tells #7; Slopdar emoji signal",
  })];
}

/* ---------- icon tile above every heading (Impeccable icon-tile-stack) ---------- */
function iconTileStack(snap: Snapshot, kids: Map<number, El[]>, idx: Map<number, El>): Finding[] {
  const tiles: El[] = [];
  for (const h of snap.headings) {
    const e = idx.get(h.i);
    if (!e) continue;
    const sibs = kids.get(e.p) || [];
    const pos = sibs.indexOf(e);
    if (pos <= 0) continue;
    const prev = sibs[pos - 1];
    const sq = prev.r.w >= 32 && prev.r.w <= 128 && prev.r.h >= 32 && prev.r.h <= 128 && prev.r.w / prev.r.h >= 0.7 && prev.r.w / prev.r.h <= 1.4;
    if (!sq || !(hasBg(prev) || hasBorder(prev)) || prev.s.radiusPx >= prev.r.w / 2) continue;
    if (prev.text && prev.text.replace(/\p{Extended_Pictographic}|\s/gu, "").length > 2) continue; // an emoji inside the tile still counts
    tiles.push(prev);
  }
  if (tiles.length < 3) return [];
  return [mk({
    rule: "icon-tile-stack", source: "squint", category: "generic", severity: "warn", confidence: "measured",
    title: `Rounded icon tile above ${tiles.length} headings`,
    evidence: `${tiles.length} near-square ${round(tiles[0].r.w)}px boxes with a background sit directly above headings. The icon-in-a-tinted-square above every feature title is the default generated feature grid.`,
    fix: "Remove the tile backgrounds and let the icon sit inline with the heading, or drop the icons and let the headings carry the row.",
    rects: tiles.slice(0, 6).map((t) => t.r), citation: "Impeccable icon-tile-stack (Apache-2.0)",
  })];
}

/* ---------- hero + three equal cards ---------- */
function heroThreeCards(snap: Snapshot, kids: Map<number, El[]>): Finding[] {
  const rows: El[][] = [];
  for (const [, group] of kids) {
    const cards = group.filter((e) => isCardLike(e) && e.r.w >= 180 && e.tlen >= 20);
    if (cards.length !== 3) continue;
    const w = cards[0].r.w;
    if (!cards.every((c) => Math.abs(c.r.w - w) < 4 && Math.abs(c.r.y - cards[0].r.y) < 4)) continue;
    rows.push(cards);
  }
  if (!rows.length) return [];
  const sev = rows.length >= 2 ? "warn" : "info";
  return [mk({
    rule: "three-equal-cards", source: "squint", category: "generic", severity: sev, confidence: "measured",
    title: `${rows.length} row${rows.length > 1 ? "s" : ""} of three identical cards`,
    evidence: `Three ${round(rows[0][0].r.w)}px-wide cards of equal weight (${rows[0].map((c) => `“${c.text || firstText(c, snap)}”`).join(", ")}). The hero + three feature cards skeleton is tell #9; equal weight tells the reader nothing is more important than anything else.`,
    fix: "Decide which one matters and make it bigger, or turn the three into one sentence each under a single heading. Break the symmetry once.",
    rects: rows[0].map((c) => c.r), citation: "vibecoded-design-tells #9; 21st.dev: uniform features is a top-5 tell",
  })];
}
function firstText(c: El, snap: Snapshot) {
  const d = snap.els.find((e) => e.p === c.i && e.text);
  return d?.text.slice(0, 24) || c.cls;
}

/* ---------- eyebrow chip above oversized h1 (Impeccable hero-eyebrow-chip) ---------- */
function eyebrowChip(snap: Snapshot, kids: Map<number, El[]>, idx: Map<number, El>): Finding[] {
  for (const h of snap.headings) {
    if (h.level !== 1) continue;
    const e = idx.get(h.i);
    if (!e || e.s.fontSize < 40) continue;
    const sibs = kids.get(e.p) || [];
    const pos = sibs.indexOf(e);
    if (pos <= 0) continue;
    const prev = sibs[pos - 1];
    const t = prev.text || "";
    if (t.length < 2 || t.length > 60 || prev.s.fontSize > 15) continue;
    const tracked = prev.s.textTransform === "uppercase" || parseFloat(prev.s.letterSpacing) > 0.5;
    const chip = (hasBg(prev) || hasBorder(prev)) && prev.s.radiusPx >= 8;
    const dashed = /^[-–—•]/.test(t);
    if (!(tracked || chip || dashed)) continue;
    return [mk({
      rule: "hero-eyebrow-chip", source: "squint", category: "generic", severity: "info", confidence: "measured",
      title: `Eyebrow ${chip ? "chip" : "label"} above the hero headline`,
      evidence: `“${t}” (${round(prev.s.fontSize)}px${tracked ? ", tracked caps" : ""}${chip ? ", pill" : ""}) sits directly above a ${round(e.s.fontSize)}px h1. The tiny label + giant headline pairing is the default generated SaaS hero.`,
      fix: "Fold the label into the headline or the first sentence. If it's an announcement, make it a real link somewhere else.",
      rects: [prev.r, e.r], citation: "Impeccable hero-eyebrow-chip (Apache-2.0)",
    })];
  }
  return [];
}

/* ---------- the 2026 “tasteful default”: cream + serif display + sage/forest accent ---------- */
function tastefulDefault(snap: Snapshot): Finding[] {
  const bg = parseColor(snap.bodyBg);
  if (!bg) return [];
  // Cream is warm off-white. Pure white and cool greys are not the tell, whatever the accent.
  const warm = bg.r - bg.b >= 4 && bg.r + bg.g + bg.b < 762;
  const cream = warm && (CREAM_BG.some(([r, g, b]) => Math.abs(bg.r - r) + Math.abs(bg.g - g) + Math.abs(bg.b - b) <= 18) || (bg.r > 240 && bg.g > 235 && bg.b > 215 && bg.r - bg.b >= 6));
  if (!cream) return [];
  const serif = snap.els.some((e) => /^h[1-2]$/.test(e.tag) && SERIF_DISPLAY.includes(e.s.fontFamily.toLowerCase()));
  const green = snap.els.filter((e) => {
    for (const c of [parseColor(e.s.bg), parseColor(e.s.color)]) {
      if (!c || c.a < 0.5 || chroma(c) < 25) continue;
      const { h, l } = hsl(c);
      if (h >= 120 && h <= 180 && l < 0.6) return true;
    }
    return false;
  }).length;
  const parts = ["cream background"];
  if (serif) parts.push("serif display face");
  if (green >= 2) parts.push("sage/teal accent");
  if (parts.length < 2) return [];
  return [mk({
    rule: "tasteful-default", source: "squint", category: "generic", severity: parts.length === 3 ? "warn" : "info", confidence: "heuristic",
    title: `The 2026 “tasteful default”: ${parts.join(" + ")}`,
    evidence: `Body background ${snap.bodyBg}${serif ? ", serif headings" : ""}${green >= 2 ? `, ${green} green/teal accents` : ""}. This is the look the previous wave of anti-slop advice converged on, and the fastest-rising tell in the Reddit corpus: it reads as “AI tried to be tasteful”.`,
    fix: "Nothing here is wrong in isolation. Make one choice that isn't the default: a background that isn't cream, a typeface with a point of view, or an accent pulled from your actual subject (a photo, a logo, a place).",
    citation: "vibecoded-design-tells (MIT) tell #0",
  })];
}

/* ---------- untouched shadcn / Tailwind defaults ---------- */
function shadcnUntouched(snap: Snapshot): Finding[] {
  const hits = snap.els.filter((e) => /\brounded-(lg|xl)\b/.test(e.cls) && /\bborder\b/.test(e.cls) && /\bbg-card\b|\bshadow-sm\b/.test(e.cls));
  if (hits.length < 2) return [];
  return [mk({
    rule: "shadcn-untouched", source: "squint", category: "generic", severity: "info", confidence: "measured",
    title: `${hits.length} untouched shadcn/ui cards`,
    evidence: `Class strings like “${hits[0].cls}” are the component library's defaults, unmodified. Fine as scaffolding; as the final look it's tell #1.`,
    fix: "Change the tokens (radius, border colour, shadow) once in your theme so the components stop looking like the docs page.",
    rects: hits.slice(0, 4).map((h) => h.r), citation: "vibecoded-design-tells (MIT) tell #1",
  })];
}

function animationOverload(snap: Snapshot): Finding[] {
  const animated = snap.els.filter((e) => e.s.animation);
  if (animated.length < 8) return [];
  return [mk({
    rule: "animation-overload", source: "squint", category: "generic", severity: "info", confidence: "measured",
    title: `${animated.length} elements animating at rest`,
    evidence: `Keyframes in use: ${[...new Set(animated.map((a) => a.s.animation))].slice(0, 5).join(", ")}. Motion on everything is tell #4.`,
    fix: "Animate the one thing you want the eye to go to. Everything else should hold still.",
    citation: "vibecoded-design-tells (MIT) tell #4",
  })];
}
