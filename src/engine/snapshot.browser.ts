/**
 * Runs INSIDE the page via page.evaluate. Must be self-contained: no imports,
 * no references to module scope. Returns a Snapshot-shaped plain object.
 */
export function captureSnapshot(): unknown {
  const MAX_ELS = 4000;
  const INTERACTIVE = new Set(["a", "button", "input", "select", "textarea", "summary", "label"]);
  const LANDMARK = new Set(["header", "nav", "main", "footer", "aside", "section", "article", "form"]);
  const SKIP = new Set(["script", "style", "noscript", "template", "head", "meta", "link", "title", "br", "wbr"]);

  const px = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sx = window.scrollX;
  const sy = window.scrollY;
  const fullHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body ? document.body.scrollHeight : 0,
  );

  const all: Element[] = [];
  const indexOf = new Map<Element, number>();

  // Depth-first order so parents precede children.
  const walk = (node: Element, depth: number) => {
    if (all.length >= MAX_ELS) return;
    const tag = node.tagName.toLowerCase();
    if (SKIP.has(tag)) return;
    indexOf.set(node, all.length);
    all.push(node);
    (node as unknown as { __d: number }).__d = depth;
    for (const c of Array.from(node.children)) walk(c, depth + 1);
  };
  if (document.body) walk(document.body, 0);

  const fonts = new Set<string>();
  const headings: { level: number; text: string; i: number }[] = [];
  const els: unknown[] = [];

  const directText = (n: Element) => {
    let t = "";
    for (const c of Array.from(n.childNodes)) if (c.nodeType === 3) t += c.textContent || "";
    return t.replace(/\s+/g, " ").trim();
  };

  // Union of descendant text-node ranges and media boxes (page coords).
  const contentRect = (n: Element) => {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const add = (r: DOMRect) => {
      if (r.width <= 0 || r.height <= 0) return;
      x1 = Math.min(x1, r.left + sx);
      y1 = Math.min(y1, r.top + sy);
      x2 = Math.max(x2, r.right + sx);
      y2 = Math.max(y2, r.bottom + sy);
    };
    const tw = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let cur: Node | null = tw.currentNode;
    let steps = 0;
    while (cur && steps++ < 2000) {
      if (cur.nodeType === 3) {
        if ((cur.textContent || "").trim()) {
          const range = document.createRange();
          range.selectNodeContents(cur);
          for (const r of Array.from(range.getClientRects())) add(r);
        }
      } else if (cur.nodeType === 1) {
        const e = cur as Element;
        const t = e.tagName.toLowerCase();
        if (t === "img" || t === "svg" || t === "video" || t === "canvas" || t === "picture" || t === "iframe") {
          add(e.getBoundingClientRect());
        } else if (t !== "html") {
          const cs = getComputedStyle(e);
          // A visible background on a child counts as content too (e.g. a pill).
          if (e !== n && cs.backgroundImage !== "none" && !cs.backgroundImage.startsWith("linear-gradient(rgba(0, 0, 0, 0)")) {
            add(e.getBoundingClientRect());
          }
        }
      }
      cur = tw.nextNode();
    }
    if (!Number.isFinite(x1)) return undefined;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };

  for (let i = 0; i < all.length; i++) {
    const n = all[i];
    const tag = n.tagName.toLowerCase();
    const cs = getComputedStyle(n);
    const br = n.getBoundingClientRect();
    const r = { x: br.left + sx, y: br.top + sy, w: br.width, h: br.height };
    const visible =
      cs.display !== "none" && cs.visibility !== "hidden" && num(cs.opacity) > 0.02 && r.w >= 1 && r.h >= 1;
    if (!visible) continue;

    const fam = (cs.fontFamily || "").split(",")[0].replace(/["']/g, "").trim();
    if (fam && directText(n)) fonts.add(fam);

    const dt = directText(n);
    const tlen = (n.textContent || "").replace(/\s+/g, " ").trim().length;
    const level = /^h[1-6]$/.test(tag) ? parseInt(tag[1]) : 0;
    if (level) headings.push({ level, text: (n.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140), i });

    const isInter =
      INTERACTIVE.has(tag) ||
      n.getAttribute("role") === "button" ||
      n.getAttribute("role") === "link" ||
      n.hasAttribute("onclick") ||
      (n.hasAttribute("tabindex") && n.getAttribute("tabindex") !== "-1") ||
      cs.cursor === "pointer";

    const parent = n.parentElement;
    const p = parent && indexOf.has(parent) ? indexOf.get(parent)! : -1;

    const isPanelish =
      (cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.boxShadow !== "none" || px(cs.borderTopWidth) > 0) &&
      r.w >= 40 && r.h >= 40 && tag !== "body" && tag !== "html";

    const radiusPx = Math.max(px(cs.borderTopLeftRadius), px(cs.borderTopRightRadius), px(cs.borderBottomLeftRadius), px(cs.borderBottomRightRadius));

    let flex = "";
    if (cs.display.includes("flex")) flex = cs.flexDirection.startsWith("column") ? "column" : "row";
    else if (cs.display.includes("grid")) flex = "grid";

    els.push({
      i,
      p,
      d: (n as unknown as { __d: number }).__d,
      tag,
      id: n.id || "",
      cls: (typeof n.className === "string" ? n.className : "").split(/\s+/).filter(Boolean).slice(0, 6).join(" "),
      role: n.getAttribute("role") || "",
      r,
      text: dt.slice(0, 120),
      tlen,
      words: tlen ? (n.textContent || "").trim().split(/\s+/).length : 0,
      inter: isInter,
      land: LANDMARK.has(tag) || !!n.getAttribute("role")?.match(/^(banner|navigation|main|contentinfo|complementary|region)$/),
      cr: isPanelish ? contentRect(n) : undefined,
      nkids: n.children.length,
      s: {
        display: cs.display,
        position: cs.position,
        fontSize: px(cs.fontSize),
        fontWeight: num(cs.fontWeight),
        fontFamily: fam,
        lineHeight: cs.lineHeight === "normal" ? px(cs.fontSize) * 1.2 : px(cs.lineHeight),
        color: cs.color,
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 300),
        radius: cs.borderRadius,
        radiusPx,
        border: [px(cs.borderTopWidth), px(cs.borderRightWidth), px(cs.borderBottomWidth), px(cs.borderLeftWidth)],
        borderColor: cs.borderTopColor,
        shadow: cs.boxShadow === "none" ? "" : cs.boxShadow.slice(0, 300),
        textShadow: cs.textShadow === "none" ? "" : cs.textShadow.slice(0, 200),
        pad: [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)],
        letterSpacing: cs.letterSpacing,
        textTransform: cs.textTransform,
        opacity: num(cs.opacity),
        animation: cs.animationName === "none" ? "" : cs.animationName,
        overflow: cs.overflow,
        flex,
        cursor: cs.cursor,
        bgClip: (cs as unknown as { webkitBackgroundClip?: string }).webkitBackgroundClip || cs.backgroundClip || "",
      },
    });
  }

  // Same-origin stylesheet text (for keyframes, gradients declared but not computed, etc.)
  let css = "";
  const keyframes: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (css.length > 200_000) break;
        css += rule.cssText + "\n";
        if (rule.type === CSSRule.KEYFRAMES_RULE) keyframes.push((rule as CSSKeyframesRule).name);
      }
    } catch {
      /* cross-origin */
    }
  }

  const bodyCs = document.body ? getComputedStyle(document.body) : null;
  const htmlCs = getComputedStyle(document.documentElement);
  const bodyBg =
    bodyCs && bodyCs.backgroundColor !== "rgba(0, 0, 0, 0)" ? bodyCs.backgroundColor
    : htmlCs.backgroundColor !== "rgba(0, 0, 0, 0)" ? htmlCs.backgroundColor
    : "rgb(255, 255, 255)";

  return {
    title: document.title || "",
    url: location.href,
    viewport: { width: vw, height: vh },
    fullHeight,
    bodyBg,
    bodyText: bodyCs ? bodyCs.color : "rgb(0, 0, 0)",
    fonts: Array.from(fonts),
    text: (document.body ? document.body.innerText : "").replace(/\s+/g, " ").trim().slice(0, 60_000),
    headings,
    els,
    stylesheetText: css,
    keyframes,
  };
}
