/**
 * Mobile pass at 390px: the three things that break on a phone on most student
 * and vibe-coded sites. Horizontal overflow, text under 12px, tap targets under
 * 32px. Runs on a second render; findings are "quality".
 */
import type { El, Finding, Snapshot } from "../types";
import { ancestors, byIndex, label, mk, round } from "./util";

export function mobileRules(m: Snapshot): Finding[] {
  const out: Finding[] = [];
  const vw = m.viewport.width;
  const idx = byIndex(m);
  // An element inside an overflow:hidden/auto/scroll container (a marquee, a carousel, a code block) is clipped by design.
  const clipped = (e: El) => ancestors(e, idx, 12).some((a) => /hidden|auto|scroll|clip/.test(a.s.overflow));
  // Overflow: page wider than the viewport, or elements poking out of it.
  const wide = m.els.filter((e) => e.r.x + e.r.w > vw + 4 && e.r.w > 40 && e.s.position !== "fixed" && e.tag !== "html" && e.tag !== "body" && !clipped(e));
  if (m.scrollWidth > vw + 4 || wide.length >= 1) {
    out.push(mk({
      rule: "mobile-overflow", source: "squint", category: "quality", severity: m.scrollWidth > vw + 4 ? "error" : "warn", confidence: "measured",
      title: m.scrollWidth > vw + 4 ? `Page scrolls sideways on a phone (${m.scrollWidth}px wide at ${vw}px)` : `${wide.length} element${wide.length > 1 ? "s" : ""} wider than the phone screen`,
      evidence: wide.length ? `e.g. ${wide.slice(0, 3).map((e) => `${label(e)} ends at ${round(e.r.x + e.r.w)}px`).join("; ")}.` : `document.scrollWidth is ${m.scrollWidth}px.`,
      fix: "Find the fixed-width element (tables, code blocks, images, grids with min-width) and give it max-width: 100% or overflow-x: auto. Test at 390px.",
      data: { scrollWidth: m.scrollWidth, wide: wide.length },
    }));
  }
  // Tiny text
  const tiny = m.els.filter((e) => e.text && e.words >= 3 && e.s.fontSize < 12);
  const tinyWords = tiny.reduce((s, e) => s + e.words, 0);
  if (tinyWords >= 20) {
    out.push(mk({
      rule: "mobile-tiny-text", source: "squint", category: "quality", severity: tinyWords >= 80 ? "warn" : "info", confidence: "measured",
      title: `${tinyWords} words under 12px on a phone`,
      evidence: `${tiny.length} text blocks render below 12px at 390px, e.g. ${label(tiny[0])} at ${round(tiny[0].s.fontSize)}px.`,
      fix: "Body text 16px on mobile; nothing readable under 12px. If the desktop size is in px, use clamp() or a mobile breakpoint.",
    }));
  }
  // Tap targets
  // Visually-hidden (sr-only) links are 1×1 by design; skip anything that small or named as such.
  const small = m.els.filter((e: El) => e.inter && (e.tag === "a" || e.tag === "button" || e.role === "button") && e.text && (e.r.h < 32 || e.r.w < 32) && e.r.w > 2 && e.r.h > 2 && !/sr-only|visually-hidden|screen-reader/.test(e.cls) && e.r.y < m.fullHeight);
  if (small.length >= 3) {
    out.push(mk({
      rule: "mobile-tap-targets", source: "squint", category: "quality", severity: small.length >= 8 ? "warn" : "info", confidence: "measured",
      title: `${small.length} tap targets under 32px on a phone`,
      evidence: `e.g. ${small.slice(0, 3).map((e) => `${label(e)} ${round(e.r.w)}×${round(e.r.h)}px`).join("; ")}. Apple's floor is 44pt, WCAG's 24px.`,
      fix: "Give links and buttons padding so the hit area is at least 44×44px on touch screens.",
      citation: "WCAG 2.5.8 target size; Apple HIG 44pt",
    }));
  }
  return out;
}
