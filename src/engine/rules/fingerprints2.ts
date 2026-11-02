/**
 * Second batch of generated-UI fingerprints, ported from the Krebs Show HN study
 * (500 launches, Playwright + DOM checks) and slop-detect's catalogue (MIT).
 * Prevalence figures in the evidence text are from that study.
 */
import type { El, Finding, Snapshot } from "../types";
import { byIndex, childrenOf, chroma, hasBg, hasBorder, hsl, isCardLike, isTransparent, label, luminance, mk, parseColor, round } from "./util";

export function fingerprintRules2(snap: Snapshot): Finding[] {
  const kids = childrenOf(snap);
  const idx = byIndex(snap);
  return [
    ...accentStripe(snap),
    ...glassmorphism(snap),
    ...permaDark(snap),
    ...numberedSteps(snap, kids),
    ...statBanner(snap, kids),
    ...sparkleBadge(snap),
    ...fakeLogoBar(snap, kids),
    ...fakeTerminal(snap, kids),
    ...gradientAvatars(snap),
    ...centeredHero(snap, idx),
    ...capsLabels(snap, idx),
    ...auroraBlob(snap),
  ];
}

const chromatic = (c: string) => { const p = parseColor(c); return !!p && p.a > 0.2 && chroma(p) >= 40; };

/* ---------- coloured accent stripe on cards (Krebs 13%, Impeccable side-tab) ---------- */
function accentStripe(snap: Snapshot): Finding[] {
  const hits = snap.els.filter((e) => {
    const [t, r, b, l] = e.s.border;
    const one = (l >= 3 && t === 0 && r === 0 && b === 0) || (t >= 3 && l === 0 && r === 0 && b === 0);
    return one && chromatic(e.s.borderColor) && e.r.w >= 120 && e.r.h >= 40;
  });
  if (hits.length < 2) return [];
  return [mk({
    rule: "accent-stripe", source: "squint", category: "generic", severity: hits.length >= 4 ? "warn" : "info", confidence: "measured",
    title: `Coloured accent stripe on ${hits.length} cards`,
    evidence: `${label(hits[0])} has a ${round(Math.max(hits[0].s.border[0], hits[0].s.border[3]))}px ${hits[0].s.borderColor} border on one side only. The single coloured edge on every card was on 13% of Show HN launches.`,
    fix: "Drop the stripe. If the colour encodes a category, show the category word; if it doesn't, it's decoration.",
    rects: hits.slice(0, 6).map((h) => h.r), citation: "Krebs 2026 (13%); Impeccable side-tab; Fountain Institute tell #6",
  })];
}

/* ---------- glassmorphism (Krebs 17%) ---------- */
function glassmorphism(snap: Snapshot): Finding[] {
  const hits = snap.els.filter((e) => {
    if (!e.s.backdrop) return false;
    const bg = parseColor(e.s.bg);
    return !!bg && bg.a > 0.02 && bg.a < 0.85 && e.r.w >= 80 && e.r.h >= 40;
  });
  if (hits.length < 2) return [];
  return [mk({
    rule: "glassmorphism", source: "squint", category: "generic", severity: "info", confidence: "measured",
    title: `Frosted-glass panels (${hits.length})`,
    evidence: `${hits.length} elements combine backdrop-filter blur with a translucent background, e.g. ${label(hits[0])}. On 17% of Show HN launches.`,
    fix: "Use a solid surface. Translucency only earns its place when something meaningful is behind it.",
    rects: hits.slice(0, 5).map((h) => h.r), citation: "Krebs 2026 (17.1%); slop-detect glassmorphism",
  })];
}

/* ---------- permanent dark mode (Krebs 20%) ---------- */
function permaDark(snap: Snapshot): Finding[] {
  const bg = parseColor(snap.bodyBg);
  if (!bg || luminance(bg) > 0.08) return [];
  const hasScheme = /prefers-color-scheme|color-scheme\s*:/.test(snap.stylesheetText);
  if (hasScheme) return [];
  return [mk({
    rule: "perma-dark", source: "squint", category: "generic", severity: "info", confidence: "measured",
    title: "Dark mode with no light alternative",
    evidence: `Body background ${snap.bodyBg} and no prefers-color-scheme rule in the CSS. Permanent dark was on 20% of Show HN launches; it's the default "techy" look, not a decision.`,
    fix: "Not wrong by itself. If dark is the brand, keep it and make the rest deliberate; otherwise offer light, or default to it.",
    citation: "Krebs 2026 (20.3%); slop-detect perma_dark_mode",
  })];
}

/* ---------- numbered steps (Krebs 9%) ---------- */
function numberedSteps(snap: Snapshot, kids: Map<number, El[]>): Finding[] {
  for (const [, group] of kids) {
    if (group.length < 3 || group.length > 8) continue;
    let n = 0;
    const rects = [];
    for (const g of group) {
      const badge = (kids.get(g.i) || []).concat(g).find((c) => /^(0?[1-9]|1[0-2])\.?$/.test(c.text || "") && c.r.w <= 64 && c.r.h <= 64 && (hasBg(c) || hasBorder(c) || c.s.radiusPx >= 8));
      if (badge) { n++; rects.push(g.r); }
    }
    if (n >= 3) {
      return [mk({
        rule: "numbered-steps", source: "squint", category: "generic", severity: "info", confidence: "heuristic",
        title: `“How it works” in ${n} numbered steps`,
        evidence: `${n} siblings each lead with a number in a badge. The three-step setup strip was on 9% of Show HN launches; on a landing page it usually says less than one screenshot would.`,
        fix: "Replace with the actual product: a screenshot, a 10-second clip, or the real command to run.",
        rects, citation: "Krebs 2026 (9.4%); slop-detect numbered_steps",
      })];
    }
  }
  return [];
}

/* ---------- stat banner (Krebs 12%) ---------- */
function statBanner(snap: Snapshot, kids: Map<number, El[]>): Finding[] {
  for (const [, group] of kids) {
    if (group.length < 3 || group.length > 6) continue;
    const top = group[0].r.y;
    if (!group.every((g) => Math.abs(g.r.y - top) < 6)) continue;
    let n = 0;
    for (const g of group) {
      const big = (kids.get(g.i) || []).find((c) => c.text && /^[\d.,]+\s?[KMB+%x×]*\+?$/i.test(c.text.trim()) && c.s.fontSize >= 26);
      if (big) n++;
    }
    if (n >= 3) {
      const nums = group.map((g) => (kids.get(g.i) || []).find((c) => c.text && /^[\d.,]+\s?[KMB+%x×]*\+?$/i.test(c.text.trim()))?.text).filter(Boolean);
      return [mk({
        rule: "stat-banner", source: "squint", category: "generic", severity: "info", confidence: "heuristic",
        title: `Stat banner: ${nums.slice(0, 4).join(" · ")}`,
        evidence: `A row of ${n} big numbers with small labels. On 12% of Show HN launches. Real numbers are fine; the pattern reads as template when the numbers are round, unsourced, or "99.9% uptime" on a weekend project.`,
        fix: "Keep it only if each number is real, specific and checkable (link the source). Otherwise fold the one true number into a sentence.",
        rects: group.map((g) => g.r), citation: "Krebs 2026 (12.2%); slop-detect stat_banner",
      })];
    }
  }
  return [];
}

/* ---------- ✨ AI sparkle badges ---------- */
function sparkleBadge(snap: Snapshot): Finding[] {
  const hits = snap.els.filter((e) => e.text && /✨|⚡|🚀/.test(e.text) && e.r.h <= 44 && (hasBg(e) || hasBorder(e)) && e.s.radiusPx >= 8 && /ai|new|beta|powered|launch|introducing/i.test(e.text));
  if (!hits.length) return [];
  return [mk({
    rule: "sparkle-badge", source: "squint", category: "generic", severity: "info", confidence: "measured",
    title: `“${hits[0].text.slice(0, 30)}” sparkle badge`,
    evidence: `A pill with an emoji announcing AI / new / beta. Every generated launch page has one.`,
    fix: "Say what the AI does in the headline instead of announcing that it exists.",
    rects: hits.slice(0, 3).map((h) => h.r), citation: "slop-detect ai_sparkle_badges",
  })];
}

/* ---------- fake logo bar ---------- */
function fakeLogoBar(snap: Snapshot, kids: Map<number, El[]>): Finding[] {
  for (const e of snap.els) {
    if (!/trusted by|as seen (in|on)|used by|loved by|backed by|featured (in|on)/i.test(e.text || "")) continue;
    // Look at the next two siblings for a row of small images/SVGs.
    const sibs = kids.get(e.p) || [];
    const pos = sibs.indexOf(e);
    for (const cand of sibs.slice(pos + 1, pos + 3)) {
      const logos = snap.els.filter((x) => x.p === cand.i || (idxParent(x, cand, snap) && (x.tag === "img" || x.tag === "svg"))).filter((x) => (x.tag === "img" || x.tag === "svg") && x.r.h <= 60 && x.r.w <= 200);
      if (logos.length >= 4) {
        return [mk({
          rule: "logo-bar", source: "squint", category: "generic", severity: "info", confidence: "heuristic",
          title: `“${e.text.slice(0, 30)}” logo bar with ${logos.length} logos`,
          evidence: "A trusted-by strip is a template slot. If these are real customers it's fine; if they're placeholder marks, Google-able brands you don't have, or grey rectangles, it's the single most damaging kind of fake.",
          fix: "Keep only logos you have permission to show, link each to the proof, or delete the strip.",
          rects: [cand.r], citation: "slop-detect fake_logo_bar; 21st.dev tell #4",
        })];
      }
    }
  }
  return [];
}
function idxParent(x: El, ancestor: El, snap: Snapshot): boolean {
  let cur = x;
  for (let i = 0; i < 6 && cur.p >= 0; i++) {
    if (cur.p === ancestor.i) return true;
    const p = snap.els.find((e) => e.i === cur.p);
    if (!p) return false;
    cur = p;
  }
  return false;
}

/* ---------- fake macOS terminal/window chrome: three coloured dots ---------- */
function fakeTerminal(snap: Snapshot, kids: Map<number, El[]>): Finding[] {
  for (const [, group] of kids) {
    const dots = group.filter((d) => d.r.w >= 8 && d.r.w <= 16 && Math.abs(d.r.w - d.r.h) <= 2 && d.s.radiusPx >= d.r.w / 2 - 1 && !isTransparent(d.s.bg));
    if (dots.length < 3) continue;
    const hues = dots.slice(0, 3).map((d) => hsl(parseColor(d.s.bg)!).h);
    const hasRed = hues.some((h) => h < 20 || h > 340), hasYellow = hues.some((h) => h >= 30 && h <= 65), hasGreen = hues.some((h) => h >= 90 && h <= 160);
    if (hasRed && hasYellow && hasGreen) {
      return [mk({
        rule: "fake-window-chrome", source: "squint", category: "generic", severity: "info", confidence: "measured",
        title: "Fake macOS window dots",
        evidence: "Three red/yellow/green circles drawn in CSS to make a box look like a terminal or app window. Generated UIs use it to frame fake screenshots.",
        fix: "Show a real screenshot of the real thing, or a plain code block.",
        rects: dots.slice(0, 3).map((d) => d.r), citation: "slop-detect fake_macos_terminal",
      })];
    }
  }
  return [];
}

/* ---------- gradient letter avatars ---------- */
function gradientAvatars(snap: Snapshot): Finding[] {
  const hits = snap.els.filter((e) => e.r.w >= 28 && e.r.w <= 72 && Math.abs(e.r.w - e.r.h) <= 2 && e.s.radiusPx >= e.r.w / 2 - 1 && /gradient/.test(e.s.bgImage) && /^[A-Z]{1,2}$/.test((e.text || "").trim()));
  if (hits.length < 2) return [];
  return [mk({
    rule: "gradient-avatars", source: "squint", category: "generic", severity: "warn", confidence: "measured",
    title: `${hits.length} gradient letter avatars`,
    evidence: `Round gradient circles with initials (${hits.map((h) => h.text.trim()).join(", ")}) stand in for people who don't have photos, which usually means people who don't exist.`,
    fix: "Use real photos of real people, or remove the testimonials.",
    rects: hits.slice(0, 6).map((h) => h.r), citation: "slop-detect gradient_letter_avatars",
  })];
}

/* ---------- centered hero in a generic sans (Krebs 23.5%) ---------- */
function centeredHero(snap: Snapshot, idx: Map<number, El>): Finding[] {
  const h1 = snap.headings.find((h) => h.level === 1);
  const e = h1 && idx.get(h1.i);
  if (!e || e.s.textAlign !== "center" || e.s.fontSize < 40 || e.r.y > snap.viewport.height) return [];
  const centeredKids = snap.els.filter((x) => x.r.y > e.r.y && x.r.y < e.r.y + 400 && x.text && x.s.textAlign === "center").length;
  if (centeredKids < 1) return [];
  return [mk({
    rule: "centered-hero", source: "squint", category: "generic", severity: "info", confidence: "measured",
    title: "Centered hero: big headline, centered sub, centered buttons",
    evidence: `h1 at ${round(e.s.fontSize)}px, centered, with ${centeredKids} centered blocks under it. On 23.5% of Show HN launches. It's the layout every builder emits when nobody chooses one.`,
    fix: "Not a problem on its own, but combined with other tells it's the skeleton. Left-align and put the product next to the headline, or lead with the product itself.",
    rects: [e.r], citation: "Krebs 2026 (23.5%); vibecoded-design-tells #9",
  })];
}

/* ---------- all-caps tracked section labels (Krebs 10.5%) ---------- */
function capsLabels(snap: Snapshot, idx: Map<number, El>): Finding[] {
  const NAV = new Set(["nav", "header", "footer", "button", "a"]);
  const hits = snap.els.filter((e) => {
    if (!e.text || e.text.length < 3 || e.text.length > 40 || NAV.has(e.tag)) return false;
    if (e.s.textTransform !== "uppercase" && e.text !== e.text.toUpperCase()) return false;
    if (parseFloat(e.s.letterSpacing) < 0.5) return false;
    if (e.s.fontSize > 15) return false;
    const p = idx.get(e.p);
    return !(p && NAV.has(p.tag));
  });
  if (hits.length < 3) return [];
  return [mk({
    rule: "caps-labels", source: "squint", category: "generic", severity: "info", confidence: "measured",
    title: `${hits.length} tracked all-caps section labels`,
    evidence: `Small uppercase, letter-spaced labels like “${hits[0].text}” above sections. On 10.5% of Show HN launches, and usually redundant with the heading under them.`,
    fix: "Delete the label or fold its word into the heading.",
    rects: hits.slice(0, 6).map((h) => h.r), citation: "Krebs 2026 (10.5%); Impeccable kicker-above-heading",
  })];
}

/* ---------- aurora / mesh blob: big blurred chromatic shapes ---------- */
function auroraBlob(snap: Snapshot): Finding[] {
  const hits = snap.els.filter((e) => /blur\((\d+)px\)/.test(e.s.filter) && parseInt(e.s.filter.match(/blur\((\d+)px\)/)![1]) >= 40 && e.r.w >= 200 && (chromatic(e.s.bg) || /gradient/.test(e.s.bgImage)) && !e.text);
  const radial = snap.els.filter((e) => /radial-gradient/.test(e.s.bgImage) && e.r.w >= 400 && e.r.h >= 200 && !e.text);
  const all = [...hits, ...radial];
  if (!all.length) return [];
  return [mk({
    rule: "aurora-blob", source: "squint", category: "generic", severity: "info", confidence: "measured",
    title: `Blurred colour blobs behind the content (${all.length})`,
    evidence: `${label(all[0])} is a ${all[0].s.filter ? all[0].s.filter : "radial-gradient"} wash. The aurora backdrop is the default "atmosphere" of generated heroes.`,
    fix: "Remove it and let the content carry the first screen. If you want atmosphere, use one real image.",
    rects: all.slice(0, 3).map((h) => h.r), citation: "slop-detect aurora_mesh_gradient; Fountain Institute tell #2",
  })];
}

void isCardLike;
