/**
 * First-impression metrics computed from the viewport screenshot, following
 * Reinecke et al., CHI 2013 ("Predicting users' first impressions of website
 * aesthetics with a quantification of perceived visual complexity and
 * colorfulness"): colorfulness (Hasler & Süsstrunk 2003) and a quadtree-based
 * visual complexity. Reinecke found complexity + colorfulness explain ~48% of
 * variance in 500ms appeal ratings, with high complexity the strongest negative.
 * vizweb (the authors' Java code) was read for thresholds only; this is a
 * fresh implementation on sharp.
 */
import sharp from "sharp";
import type { AppealMetrics, Finding, Snapshot } from "../types";
import { mk, round, parseColor } from "../rules/util";

export async function appealMetrics(viewportPng: Buffer, snap: Snapshot): Promise<{ metrics: AppealMetrics; findings: Finding[]; score: number }> {
  const W = 800;
  const img = sharp(viewportPng).resize({ width: W, withoutEnlargement: true });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;
  const px = (x: number, y: number) => {
    const o = (y * w + x) * ch;
    return [data[o], data[o + 1], data[o + 2]] as const;
  };

  // --- Colorfulness (Hasler & Süsstrunk M3) ---
  let n = 0, srg = 0, syb = 0, srg2 = 0, syb2 = 0;
  const hueBins = new Uint32Array(36);
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const [r, g, b] = px(x, y);
      const rg = r - g, yb = (r + g) / 2 - b;
      srg += rg; syb += yb; srg2 += rg * rg; syb2 += yb * yb; n++;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max - min > 40) {
        let hue = 0;
        const d = max - min;
        if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) hue = ((b - r) / d + 2) * 60;
        else hue = ((r - g) / d + 4) * 60;
        hueBins[Math.floor(hue / 10) % 36]++;
      }
    }
  }
  const mrg = srg / n, myb = syb / n;
  const sdrg = Math.sqrt(Math.max(0, srg2 / n - mrg * mrg)), sdyb = Math.sqrt(Math.max(0, syb2 / n - myb * myb));
  const colorfulness = Math.sqrt(sdrg ** 2 + sdyb ** 2) + 0.3 * Math.sqrt(mrg ** 2 + myb ** 2);
  const distinctHues = [...hueBins].filter((c) => c > n * 0.004).length;

  // --- Whitespace ratio: pixels within a small distance of the body background ---
  const bg = parseColor(snap.bodyBg) || { r: 255, g: 255, b: 255, a: 1 };
  let near = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const [r, g, b] = px(x, y);
    if (Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b) < 24) near++;
  }
  const whitespaceRatio = near / n;

  // --- Quadtree complexity on grayscale: split while a block's intensity entropy is high ---
  // Text boxes are painted over with the body background first: a page with a lot
  // of readable text is not "busy" in Reinecke's sense; shapes, images and colour are.
  const vw = snap.viewport.width, vh = snap.viewport.height;
  const scale = w / vw;
  const bgGray = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = px(x, y);
    gray[y * w + x] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  // Photos, product shots and video frames are content, not layout clutter: a dashboard screenshot
  // in the hero is one object to the eye, however many pixels it has. Mask them like text.
  const MEDIA = new Set(["img", "video", "canvas", "picture", "iframe"]);
  const isMedia = (e: { tag: string; r: { w: number; h: number } }) => MEDIA.has(e.tag) && e.r.w >= 160 && e.r.h >= 120;
  for (const e of snap.els) {
    if (!(e.text || isMedia(e)) || e.r.y > vh || (e.text && e.r.h > 0.5 * vh)) continue;
    const x0 = Math.max(0, Math.floor(e.r.x * scale)), x1 = Math.min(w, Math.ceil((e.r.x + e.r.w) * scale));
    const y0 = Math.max(0, Math.floor(e.r.y * scale)), y1 = Math.min(h, Math.ceil((e.r.y + e.r.h) * scale));
    // Use the pixel just outside the box as the fill so text on a coloured panel is erased to that panel.
    const sx = Math.max(0, x0 - 2), sy = Math.min(h - 1, Math.max(0, y0 + Math.floor((y1 - y0) / 2)));
    const fill = x0 > 2 ? gray[sy * w + sx] : bgGray;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) gray[y * w + x] = fill;
  }
  const MIN = 12; // px, vizweb stops at <10×10 on the original; we work at 800 wide
  const ENTROPY_SPLIT = 0.35; // bits over 32 intensity bins; a flat region is ~0, any edge or text pushes past this
  let leaves = 0;
  const hist = new Float32Array(32);
  const entropy = (x0: number, y0: number, x1: number, y1: number) => {
    hist.fill(0);
    let cnt = 0;
    // Sample densely enough that 1px text strokes register at every block size.
    const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 96));
    for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) { hist[Math.min(31, gray[y * w + x] >> 3)]++; cnt++; }
    let e = 0;
    for (let i = 0; i < 32; i++) if (hist[i]) { const p = hist[i] / cnt; e -= p * Math.log2(p); }
    return e;
  };
  const split = (x0: number, y0: number, x1: number, y1: number, depth: number) => {
    const bw = x1 - x0, bh = y1 - y0;
    if (bw < MIN || bh < MIN || depth > 8) { leaves++; return; }
    if (entropy(x0, y0, x1, y1) < ENTROPY_SPLIT && bw < 400) { leaves++; return; }
    const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
    split(x0, y0, mx, my, depth + 1); split(mx, y0, x1, my, depth + 1);
    split(x0, my, mx, y1, depth + 1); split(mx, my, x1, y1, depth + 1);
  };
  split(0, 0, w, h, 0);

  // --- Text density from the snapshot (share of viewport covered by text boxes) ---
  let textArea = 0;
  for (const e of snap.els) {
    if (!e.text || e.r.y > vh) continue;
    const yh = Math.min(e.r.y + e.r.h, vh) - Math.max(e.r.y, 0);
    if (yh > 0) textArea += Math.min(e.r.w, vw) * yh;
  }
  const textDensity = Math.min(1, textArea / (vw * vh));

  const metrics: AppealMetrics = {
    colorfulness: round(colorfulness, 1),
    complexityLeaves: leaves,
    whitespaceRatio: round(whitespaceRatio, 3),
    textDensity: round(textDensity, 3),
    distinctHues,
    dominantBackground: snap.bodyBg,
  };

  // --- Score: Reinecke's direction of effects, calibrated on a small sample of sites.
  // Complexity bands (quadtree leaves on an 800px-wide first screen with text masked):
  // calm pages ≈ 50–250, busy marketing pages ≈ 500+, very busy 900+.
  // Complexity is the strong predictor and gets the weight; colourfulness is the weak one.
  // Text amount was not a negative in Reinecke's model, so a wordy first screen is barely touched.
  let score = 100;
  const findings: Finding[] = [];
  const cx = leaves;
  if (cx > 900) score -= 25; else if (cx > 600) score -= 15; else if (cx > 350) score -= 6;
  if (colorfulness > 70) score -= 10; else if (colorfulness > 50) score -= 5;
  if (whitespaceRatio < 0.35) score -= 12; else if (whitespaceRatio < 0.5) score -= 5;
  if (textDensity > 0.45) score -= 4;
  if (distinctHues > 12) score -= 5;
  score = Math.max(0, Math.min(100, score));

  if (cx > 600) {
    findings.push(mk({
      rule: "high-visual-complexity", source: "metrics", category: "appeal", severity: cx > 900 ? "warn" : "info", confidence: "heuristic",
      title: "Above-the-fold is visually busy",
      evidence: `Quadtree decomposition of the first screen (text and photos masked out) needs ${cx} leaves (calm pages run 50–250; busy ones 600+). Whitespace share ${round(whitespaceRatio * 100)}%, text covers ${round(textDensity * 100)}% of the viewport.`,
      fix: "Remove one thing from the first screen. Reinecke's data says people rate low- and medium-complexity pages the same and punish high complexity; the gain is all in cutting, not adding.",
      citation: "Reinecke et al. CHI 2013; Tuch et al.: complexity drives the 50ms impression",
    }));
  }
  if (colorfulness > 50 || distinctHues > 12) {
    findings.push(mk({
      rule: "high-colorfulness", source: "metrics", category: "appeal", severity: "info", confidence: "heuristic",
      title: `Colourful first screen (M = ${round(colorfulness)}, ${distinctHues} hue bands)`,
      evidence: "Colorfulness is the weaker of the two first-impression predictors, but many competing hues read as noise rather than brand.",
      fix: "One accent hue, one neutral ramp. Let photos or product shots carry the colour.",
      citation: "Hasler & Süsstrunk 2003; Reinecke 2013",
    }));
  }
  if (whitespaceRatio < 0.35) {
    findings.push(mk({
      rule: "low-whitespace", source: "metrics", category: "appeal", severity: "info", confidence: "heuristic",
      title: `Only ${round(whitespaceRatio * 100)}% of the first screen is breathing room`,
      evidence: "Pixels close to the page background make up less than a third of the viewport.",
      fix: "Widen margins and loosen section padding; comprehension measurably improves when content is framed by empty space (Lin 2004).",
      citation: "Lin 2004 whitespace & comprehension",
    }));
  }
  return { metrics, findings, score };
}
