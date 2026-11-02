/**
 * Containers and decoration: cards that are mostly air, badges that say nothing,
 * cards inside cards, status dots. These are the "container reflex" tells from
 * no-slop (MIT) and UXly's nested-panel logic, plus two rules written for the
 * portfolio findings that started this project.
 */
import type { El, Finding, Snapshot } from "../types";
import { ancestors, area, byIndex, childrenOf, hasBg, hasBorder, hasShadow, isPanel, label, mk, round } from "./util";

export function containerRules(snap: Snapshot): Finding[] {
  const kids = childrenOf(snap);
  const idx = byIndex(snap);
  return [
    ...containerVsContent(snap, kids, idx),
    ...decorativePills(snap, kids, idx),
    ...statusDots(snap, kids),
    ...nestedPanels(snap, kids, idx),
  ];
}

/* ---------- card is mostly empty (the “this card is so long for no reason” finding) ---------- */
function containerVsContent(snap: Snapshot, kids: Map<number, El[]>, idx: Map<number, El>): Finding[] {
  const out: Finding[] = [];
  const vw = snap.viewport.width;
  for (const e of snap.els) {
    if (!isPanel(e) || !e.cr) continue;
    if (e.land) continue; // sections/heros are allowed to breathe
    if (e.r.w > 0.92 * vw) continue; // full-bleed bands are layout, not cards
    if (e.r.h < 140) continue;
    const ch = kids.get(e.i) || [];
    if (ch.some((c) => isPanel(c) && c.r.h > 0.6 * e.r.h)) continue; // a wrapper around a real card
    const fill = area(e.cr) / area(e.r);
    const bottomSlack = e.r.y + e.r.h - (e.cr.y + e.cr.h) - e.s.pad[2];
    const fs = Math.max(14, e.s.fontSize);
    if (fill < 0.4 && bottomSlack > 4 * fs) {
      const parent = idx.get(e.p);
      const siblings = (parent && kids.get(parent.i)) || [];
      const rowSibs = siblings.filter((s) => s !== e && isPanel(s) && Math.abs(s.r.y - e.r.y) < 4 && Math.abs(s.r.h - e.r.h) < 3);
      // A row of equal-height cards with one tall sibling is reported once by stretched-row-cards.
      if (rowSibs.some((s) => s.cr && s.cr.y + s.cr.h - s.r.y > e.cr!.y + e.cr!.h - e.r.y + 3 * fs)) continue;
      const cause =
        rowSibs.length ? ` It is in a ${parent?.s.flex || "row"} with ${rowSibs.length} sibling${rowSibs.length > 1 ? "s" : ""} of the same height, so it is being stretched to match the tallest one.`
        : e.s.position === "absolute" || /min-height|height/.test("") ? "" : " Nothing inside it needs the height, so a fixed height or min-height is probably set.";
      out.push(mk({
        rule: "container-vs-content", source: "squint", category: "consistency", severity: fill < 0.3 ? "error" : "warn", confidence: "measured",
        title: "Card is far taller than its content",
        evidence: `${label(e)} is ${round(e.r.w)}×${round(e.r.h)}px but its content occupies ${round(fill * 100)}% of that; ${round(bottomSlack)}px of empty space sits under the last line.${cause}`,
        fix: rowSibs.length
          ? "Use align-items: start on the row (or align-self: start on this card) so it hugs its content, or balance the siblings' content so they end near the same line."
          : "Remove the fixed height / min-height and let the card size to its content, or fill the space with something that earns it.",
        rects: [e.r, e.cr], data: { fill, bottomSlack },
        citation: "Lin 2004: whitespace helps comprehension when it frames content; dead space inside a container just reads as unfinished",
      }));
    }
  }
  return out.sort((a, b) => (a.data!.fill as number) - (b.data!.fill as number)).slice(0, 6);
}

/* ---------- decorative pills / badges (the “From the real project isn’t needed” finding) ---------- */
function isPill(e: El) {
  if (e.r.h < 16 || e.r.h > 40 || e.r.w < 24 || e.r.w > 320) return false;
  if (!(hasBg(e) || hasBorder(e))) return false;
  const roundish = e.s.radiusPx >= Math.min(e.r.h / 2 - 1, 10);
  if (!roundish) return false;
  const t = e.text || "";
  if (!t || t.length > 40) return false;
  if (["button", "input", "select", "a", "summary", "option"].includes(e.tag)) return false;
  return true;
}

function decorativePills(snap: Snapshot, kids: Map<number, El[]>, idx: Map<number, El>): Finding[] {
  const out: Finding[] = [];
  const pills = snap.els.filter((e) => isPill(e) && !e.inter);
  if (!pills.length) return out;
  const groups = new Map<number, El[]>();
  for (const p of pills) {
    if (!groups.has(p.p)) groups.set(p.p, []);
    groups.get(p.p)!.push(p);
  }
  for (const [pid, group] of groups) {
    const parent = idx.get(pid);
    const siblingPills = (kids.get(pid) || []).filter((c) => isPill(c));
    const withDot = group.filter((p) => (kids.get(p.i) || []).some((c) => isDot(c)));
    if (siblingPills.length === 1) {
      const p = group[0];
      const anc = ancestors(p, idx, 3);
      const nearCaption = anc.some((a) => a.tag === "figcaption" || a.tag === "figure") || p.p >= 0 && (idx.get(p.p)?.text?.length ?? 0) > 0;
      out.push(mk({
        rule: "decorative-badge", source: "squint", category: "generic", severity: "warn", confidence: "heuristic",
        title: `A lone badge “${p.text}” that does nothing`,
        evidence: `A ${round(p.r.w)}×${round(p.r.h)}px pill${withDot.length ? " with a status dot" : ""} that is not clickable, is not one of a set of tags, and ${nearCaption ? "repeats what the caption already says" : "labels something the surrounding text already makes clear"}. Badges imply a category system; a single one is decoration.`,
        fix: "Delete it. If the information matters, fold it into the sentence next to it. Reserve pills for things that are actually one of several (filters, statuses, tags you can click).",
        rects: [p.r], citation: "no-slop ‘status pill with dot’ heuristic (MIT); Fountain Institute tell #7 (status dots)",
      }));
    } else if (siblingPills.length >= 3 && !group.some((p) => p.inter)) {
      out.push(mk({
        rule: "inert-tags", source: "squint", category: "generic", severity: "info", confidence: "heuristic",
        title: `${siblingPills.length} tag pills that don't filter or link anything`,
        evidence: `Tags: ${siblingPills.map((p) => `“${p.text}”`).join(", ")} under ${parent ? label(parent) : "the page"}. Chips that aren't interactive are a template habit; readers try to click them.`,
        fix: "Either make them link to something (a filter, a project list) or write them as a sentence. Three words in a row don't need three boxes.",
        rects: siblingPills.map((p) => p.r), citation: "vibecoded-design-tells (MIT), container-reflex tells",
      }));
    }
  }
  return out.slice(0, 6);
}

/* ---------- status dots (Impeccable pulsing-dot, no-slop) ---------- */
function isDot(e: El) {
  return e.r.w >= 4 && e.r.w <= 16 && e.r.h >= 4 && e.r.h <= 16 && Math.max(e.r.w, e.r.h) / Math.min(e.r.w, e.r.h) <= 1.5 && e.s.radiusPx >= e.r.w / 2 - 1 && hasBg(e) && !e.text;
}
function statusDots(snap: Snapshot, kids: Map<number, El[]>): Finding[] {
  const dots = snap.els.filter(isDot);
  const pulsing = dots.filter((d) => d.s.animation);
  const out: Finding[] = [];
  if (pulsing.length) {
    out.push(mk({
      rule: "pulsing-dot", source: "squint", category: "generic", severity: "warn", confidence: "measured",
      title: `${pulsing.length} pulsing status dot${pulsing.length > 1 ? "s" : ""}`,
      evidence: `Small round elements animating with “${pulsing[0].s.animation}”. The blinking green dot that says “live” / “available” is on every AI-generated landing page.`,
      fix: "If something is actually live, show the live thing (a number, a timestamp). Otherwise remove the dot.",
      rects: pulsing.map((d) => d.r), citation: "Impeccable pulsing-dot (Apache-2.0); Fountain Institute tell #7",
    }));
  } else if (dots.length >= 3) {
    out.push(mk({
      rule: "status-dots", source: "squint", category: "generic", severity: "info", confidence: "heuristic",
      title: `${dots.length} status dots on the page`,
      evidence: "Coloured dots attached to labels where a word would say more.",
      fix: "Replace with text or remove.",
      rects: dots.slice(0, 8).map((d) => d.r), citation: "Fountain Institute tell #7",
    }));
  }
  void kids;
  return out;
}

/* ---------- cards inside cards (UXly analyzeNestedPanels, Impeccable nested-cards) ---------- */
function nestedPanels(snap: Snapshot, kids: Map<number, El[]>, idx: Map<number, El>): Finding[] {
  const vw = snap.viewport.width, vh = snap.viewport.height;
  const pairs: [El, El][] = [];
  const SKIP_OUTER = new Set(["dialog", "figure", "pre", "code", "table", "form", "nav", "header", "footer", "main", "section", "article", "aside", "body"]);
  for (const inner of snap.els) {
    if (!isPanel(inner) || !(hasShadow(inner) || hasBorder(inner))) continue;
    if (inner.tlen < 10) continue;
    let outer: El | undefined;
    for (const a of ancestors(inner, idx, 10)) {
      if (isPanel(a)) { outer = a; break; }
    }
    if (!outer || SKIP_OUTER.has(outer.tag) || outer.land) continue;
    if (outer.r.w > 0.9 * vw && outer.r.h > 0.8 * vh) continue; // page shell
    const parentOfInner = idx.get(inner.p);
    if (outer.s.flex === "grid" || (outer.s.flex && (kids.get(outer.i) || []).length >= 3)) continue; // a grid wrapper
    if (parentOfInner && parentOfInner !== outer && parentOfInner.s.flex && (kids.get(parentOfInner.i) || []).length >= 3) continue;
    if (inner.r.w > 0.95 * outer.r.w && inner.r.h > 0.85 * outer.r.h) continue;
    if (area(inner.r) / area(outer.r) >= 0.85) continue;
    if (!(hasShadow(outer) || hasBorder(outer))) continue; // outer must look like a card too
    pairs.push([inner, outer]);
  }
  if (!pairs.length) return [];
  const uniqOuter = new Set(pairs.map(([, o]) => o.i));
  return [mk({
    rule: "cards-in-cards", source: "squint", category: "generic", severity: pairs.length >= 3 ? "warn" : "info", confidence: "heuristic",
    title: `${pairs.length} card${pairs.length > 1 ? "s" : ""} nested inside other cards`,
    evidence: `${uniqOuter.size} outer container${uniqOuter.size > 1 ? "s" : ""} with bordered/shadowed children, e.g. ${label(pairs[0][0])} inside ${label(pairs[0][1])}. Every layer of box is a layer the reader has to look through.`,
    fix: "Remove the inner border/background and separate items with spacing or a divider. One container per idea.",
    rects: pairs.slice(0, 4).flatMap(([i, o]) => [o.r, i.r]),
    citation: "UXly nested-panel (MIT); Fountain Institute tell #5; Reinecke 2013: visual complexity is the strongest negative predictor of appeal",
  })];
}
