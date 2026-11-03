import type { El, Finding, Rect, Snapshot } from "../types";

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(s: string | undefined): RGBA | null {
  if (!s) return null;
  const m = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/);
  if (m) {
    let a = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (m[4]?.endsWith("%")) a /= 100;
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  const h = s.match(/^#([0-9a-f]{3,8})$/i);
  if (h) {
    let x = h[1];
    if (x.length === 3 || x.length === 4) x = x.split("").map((c) => c + c).join("");
    const r = parseInt(x.slice(0, 2), 16), g = parseInt(x.slice(2, 4), 16), b = parseInt(x.slice(4, 6), 16);
    const a = x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  return null;
}

export function isTransparent(s: string | undefined) {
  const c = parseColor(s);
  return !c || c.a < 0.03;
}

/** Hue 0–360, saturation 0–1, lightness 0–1 */
export function hsl(c: RGBA) {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s, l };
}

/** Rough chroma 0–255 (max-min), good enough for "is this a saturated colour". */
export function chroma(c: RGBA) {
  return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
}

export function luminance(c: RGBA) {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

export function contrastRatio(a: RGBA, b: RGBA) {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function hasBg(e: El) {
  return !isTransparent(e.s.bg) || !!e.s.bgImage;
}
export function hasBorder(e: El) {
  return e.s.border.some((w) => w > 0) && !isTransparent(e.s.borderColor);
}
export function has4SideBorder(e: El) {
  return e.s.border.every((w) => w > 0) && !isTransparent(e.s.borderColor);
}
export function hasShadow(e: El) {
  return !!e.s.shadow;
}
export function isPanel(e: El) {
  const INLINE = new Set(["span", "a", "b", "i", "em", "strong", "small", "code", "label", "button", "input", "select", "textarea", "img", "svg", "td", "th", "tr", "table", "thead", "tbody", "li", "ul", "ol"]);
  return (hasBg(e) || hasBorder(e) || hasShadow(e)) && e.r.w >= 50 && e.r.h >= 50 && !INLINE.has(e.tag) && e.tag !== "body";
}
/** Impeccable's definition: (shadow or 4-sided border) and (radius or bg). */
export function isCardLike(e: El) {
  return (hasShadow(e) || has4SideBorder(e)) && (e.s.radiusPx > 0 || hasBg(e));
}

export function area(r: Rect) {
  return Math.max(0, r.w) * Math.max(0, r.h);
}
export function overlap1D(a0: number, a1: number, b0: number, b1: number) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

export function childrenOf(snap: Snapshot): Map<number, El[]> {
  const m = new Map<number, El[]>();
  for (const e of snap.els) {
    if (!m.has(e.p)) m.set(e.p, []);
    m.get(e.p)!.push(e);
  }
  return m;
}

export function byIndex(snap: Snapshot): Map<number, El> {
  const m = new Map<number, El>();
  for (const e of snap.els) m.set(e.i, e);
  return m;
}

export function ancestors(e: El, idx: Map<number, El>, max = 20): El[] {
  const out: El[] = [];
  let cur = e;
  while (cur.p >= 0 && out.length < max) {
    const p = idx.get(cur.p);
    if (!p) break;
    out.push(p);
    cur = p;
  }
  return out;
}

/**
 * Illustrations built out of DOM: mock browser windows, animated system diagrams, bar charts drawn
 * with divs, device frames. They are pictures, not content cards, and every geometry rule that
 * treats them as cards ("this card is 99% empty", "these bars are misaligned") is measuring the
 * artist's choices. Detected by naming (authors name these things) and by structure (boxes with
 * almost no words, positioned absolutely, often clipped).
 */
const ARTWORK_NAME = /(^|[-_ ])(graphic|graphics|illustration|illus|animation|animated|anim|lottie|canvas|mock|mockup|artwork|visual|visuals|decor|decoration|decorative|device|frame|window|browser|skeleton|scene|particles|orbit|orb|blob|glow|shape|shapes|diagram|chart|sparkline|marquee|ticker)([-_ ]|$)/i;
export function isArtworkNamed(e: El) {
  return ARTWORK_NAME.test(e.cls) || ARTWORK_NAME.test(e.id) || e.role === "img" || e.role === "presentation" || e.role === "none";
}
/** True when the element or an ancestor (up to `depth`) is artwork by name, or the element is wordless box-art. */
export function inArtwork(e: El, idx: Map<number, El>, depth = 8) {
  if (isArtworkNamed(e)) return true;
  for (const a of ancestors(e, idx, depth)) if (isArtworkNamed(a)) return true;
  // Structural: a box bigger than a thumbnail with (almost) no words in it is a picture, not a card.
  if (e.words < 4 && e.r.w >= 120 && e.r.h >= 120 && (e.s.position === "absolute" || e.s.overflow === "hidden")) return true;
  return false;
}

export function label(e: El) {
  const t = e.text || "";
  const name = e.tag + (e.id ? `#${e.id}` : "") + (e.cls ? "." + e.cls.split(" ").slice(0, 2).join(".") : "");
  return t ? `${name} “${t.slice(0, 40)}${t.length > 40 ? "…" : ""}”` : name;
}

let counter = 0;
export function mk(f: Omit<Finding, "id">): Finding {
  counter += 1;
  return { id: `${f.source}-${f.rule}-${counter}`, ...f };
}
export function resetIds() {
  counter = 0;
}

export const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

/** Group values that differ by less than `tol` into one bucket, return distinct representatives. */
export function distinct(values: number[], tol = 0.5): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}
export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
