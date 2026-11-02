"use client";
import { useEffect, useMemo, useState } from "react";
import type { Category, Finding, Report } from "@/engine/types";
import { grade } from "@/engine/score";

const SECTIONS: { key: Category[]; title: string; blurb: string }[] = [
  { key: ["consistency", "quality"], title: "What an engineer would notice", blurb: "measured from the DOM" },
  { key: ["generic", "copy"], title: "What makes it look generated", blurb: "fingerprints and copy tells" },
  { key: ["clarity"], title: "Can a stranger tell what this is", blurb: "reviewer judgment" },
  { key: ["appeal"], title: "First impression", blurb: "complexity and colour, after Reinecke 2013" },
];

const SEV_LABEL = { error: "ERROR", warn: "WARN", info: "INFO" } as const;

export function ReportView({ report }: { report: Report }) {
  const [hover, setHover] = useState<string | null>(null);
  const g = grade(report.score);
  const { w: imgW, h: imgH } = report.screenshot.fullSize;
  const byId = useMemo(() => new Map(report.findings.map((f) => [f.id, f])), [report.findings]);
  const active = hover ? byId.get(hover) : undefined;
  const shotUrl = `/api/report/${report.id}/screenshot?which=full`;
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of report.findings) counts[f.severity]++;

  return (
    <main>
      <div className="rhead">
        <div>
          <h1>{report.page.title || report.input.url || "Pasted HTML"}</h1>
          <p className="url">
            {report.input.url ? <a href={report.page.finalUrl} target="_blank" rel="noreferrer">{report.page.finalUrl}</a> : "HTML pasted in"} · {report.input.pageType} · {report.page.elementCount} elements · {report.page.wordCount} words · {report.page.fonts.slice(0, 3).join(", ") || "no fonts detected"}
          </p>
        </div>
        <div className="score">
          <div className="n">{report.score}<small>/100</small></div>
          <div className="g"><b>{g.letter}</b>{g.word} · {counts.error} errors, {counts.warn} warnings, {counts.info} notes</div>
        </div>
      </div>

      <div className="subs">
        <Sub k="Consistency" v={report.subScores.consistency} d="alignment, type scale, spacing" />
        <Sub k="Not generic" v={report.subScores.generic} d="AI fingerprints, copy" />
        {report.judge
          ? <Sub k="Clarity" v={report.subScores.clarity} d="ten-second test" />
          : <SubLocked k="Clarity" d="ten-second test · Pro" />}
        <Sub k="First impression" v={report.subScores.appeal} d={report.metrics ? `${report.metrics.complexityLeaves} leaves · M ${report.metrics.colorfulness}` : "—"} />
      </div>

      <ShareBox report={report} />

      <div className="layout">
        <div>
          {report.judge && (
            <div className="ten">
              <div>
                <h2>Ten-second test — first screen only, judged by {report.judge.provider}/{report.judge.model}</h2>
                <dl>
                  <dt>What is this</dt><dd>{report.judge.tenSecondTest.whatIsThis}</dd>
                  <dt>Who is it for</dt><dd>{report.judge.tenSecondTest.whoIsItFor}</dd>
                  <dt>Why care</dt><dd>{report.judge.tenSecondTest.whyCare}</dd>
                  {report.judge.tenSecondTest.missing.length > 0 && <><dt>Still unknown</dt><dd>{report.judge.tenSecondTest.missing.join("; ")}</dd></>}
                </dl>
              </div>
              <div>
                <div className="n">{report.judge.tenSecondTest.score}</div>
                <div className={`pass ${report.judge.tenSecondTest.passed ? "" : "no"}`}>{report.judge.tenSecondTest.passed ? "passes" : "does not pass"}</div>
              </div>
            </div>
          )}
          {!report.judge && (
            <div className="pro">
              <div className="tag">Pro · coming soon</div>
              <h2>Ten-second test and tailored advice</h2>
              <p>
                A reviewer that has never seen your code looks at the first screen alone and answers what this is, who it&apos;s for and why anyone should care; finds copy that could be on any site and rewrites it with facts from your page; and gives advice conditioned on what the page is for{report.input.goal ? <> (you said: &ldquo;{report.input.goal}&rdquo;)</> : null}. Critiques follow Google&apos;s UICrit format: expected standard, current design, fix.
              </p>
              <p className="small">Everything above this box is measured and free. This part costs us per scan, so it&apos;ll be the paid tier.</p>
            </div>
          )}

          {report.judge && report.judge.tailoredAdvice.length > 0 && (
            <section className="sec">
              <h2>Tailored to this page&apos;s goal <span>{report.input.goal ? `“${report.input.goal}”` : report.input.pageType}</span></h2>
              {report.judge.tailoredAdvice.map((a, i) => (
                <div className="advice" key={i}>
                  <h3>{a.title}</h3>
                  <p>{a.why}</p>
                  <p className="fix">{a.fix}</p>
                </div>
              ))}
            </section>
          )}

          {SECTIONS.map((s) => {
            const fs = report.findings.filter((f) => s.key.includes(f.category));
            return (
              <section className="sec" key={s.title}>
                <h2>{s.title} <span>{fs.length ? `${fs.length} · ${s.blurb}` : s.blurb}</span></h2>
                {fs.length === 0 && <p className="empty">Nothing flagged.</p>}
                {fs.map((f) => (
                  <FindingRow key={f.id} f={f} onHover={setHover} shotUrl={shotUrl} imgW={imgW} imgH={imgH} reportId={report.id} />
                ))}
              </section>
            );
          })}

          <div className="engines">
            {report.engines.map((e) => (
              <span key={e.name} className={e.ok ? "" : "bad"}>{e.name} {e.ok ? "✓" : "✗"} {e.durationMs}ms{e.note ? ` (${e.note})` : ""}</span>
            ))}
          </div>
        </div>

        <aside className="shot">
          <div className="shotbar"><span>Full page at {report.page.viewport.width}px</span><span>{active ? `${active.rects?.length || 0} box${(active.rects?.length || 0) === 1 ? "" : "es"}` : "hover a finding"}</span></div>
          <div className="inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shotUrl} alt="Full-page screenshot" width={imgW} height={imgH} />
            {report.findings.flatMap((f) =>
              (f.rects || []).map((r, i) => (
                <div
                  key={`${f.id}-${i}`}
                  className={`box ${hover === f.id ? "on" : ""} ${i > 0 && f.rule === "container-vs-content" ? "secondary" : ""}`}
                  style={{ left: `${(r.x / imgW) * 100}%`, top: `${(r.y / imgH) * 100}%`, width: `${(r.w / imgW) * 100}%`, height: `${(r.h / imgH) * 100}%` }}
                />
              )),
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function SubLocked({ k, d }: { k: string; d: string }) {
  return (
    <div className="locked">
      <div className="k">{k}</div>
      <div className="v">&mdash;</div>
      <div className="bar"><i style={{ width: 0 }} /></div>
      <div className="d">{d}</div>
    </div>
  );
}

function Sub({ k, v, d }: { k: string; v: number; d: string }) {
  return (
    <div>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="bar"><i style={{ width: `${v}%` }} /></div>
      <div className="d">{d}</div>
    </div>
  );
}

function FindingRow({ f, onHover, shotUrl, imgW, imgH, reportId }: { f: Finding; onHover: (id: string | null) => void; shotUrl: string; imgW: number; imgH: number; reportId: string }) {
  const r = f.rects?.[0];
  return (
    <div className="f" onMouseEnter={() => onHover(f.id)} onMouseLeave={() => onHover(null)}>
      <div className={`sev ${f.severity}`}>
        {SEV_LABEL[f.severity]}
        <small>{f.confidence}{f.source !== "squint" ? ` · ${f.source}` : ""}</small>
      </div>
      <div>
        <h3>{f.title}</h3>
        <p className="ev">{f.evidence}</p>
        <p className="fix">{f.fix}</p>
        {f.citation && <p className="cite">{f.citation}</p>}
        <Feedback reportId={reportId} findingId={f.id} />
      </div>
      {r && imgW > 0 && <Crop rect={r} shotUrl={shotUrl} imgW={imgW} imgH={imgH} />}
    </div>
  );
}

/** A cropped view of the full-page screenshot around a finding's first box, done with CSS only. */
function Crop({ rect, shotUrl, imgW, imgH }: { rect: { x: number; y: number; w: number; h: number }; shotUrl: string; imgW: number; imgH: number }) {
  const W = 180, H = 120;
  const pad = 24;
  const x0 = Math.max(0, rect.x - pad), y0 = Math.max(0, rect.y - pad);
  const cw = Math.min(imgW - x0, rect.w + pad * 2), ch = Math.min(imgH - y0, rect.h + pad * 2);
  const scale = Math.min(W / cw, H / ch, 1);
  const bw = imgW * scale, bh = imgH * scale;
  const ox = -x0 * scale + (W - cw * scale) / 2, oy = -y0 * scale + (H - ch * scale) / 2;
  return (
    <div className="crop" style={{ width: W, height: H, backgroundImage: `url(${shotUrl})`, backgroundSize: `${bw}px ${bh}px`, backgroundPosition: `${ox}px ${oy}px` }} aria-hidden>
      <i style={{ left: (W - rect.w * scale) / 2, top: (H - rect.h * scale) / 2, width: rect.w * scale, height: rect.h * scale }} />
    </div>
  );
}

function Feedback({ reportId, findingId }: { reportId: string; findingId: string }) {
  const key = `fb:${reportId}:${findingId}`;
  const [sent, setSent] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Read the remembered verdict after mount (localStorage isn't available during SSR).
    const t = setTimeout(() => { try { setSent(localStorage.getItem(key)); } catch {} setHydrated(true); }, 0);
    return () => clearTimeout(t);
  }, [key]);
  async function send(verdict: "right" | "wrong") {
    setSent(verdict);
    try { localStorage.setItem(key, verdict); } catch {}
    await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId, findingId, verdict }) }).catch(() => {});
  }
  if (!hydrated) return <div className="fb" />;
  return (
    <div className="fb">
      {sent ? <span>Thanks — marked {sent}.</span> : (<>
        <span>Is this right?</span>
        <button type="button" onClick={() => send("right")}>Yes</button>
        <button type="button" onClick={() => send("wrong")}>No</button>
      </>)}
    </div>
  );
}

/** A paste-into-your-agent prompt built from the measured findings. */
function buildFixPrompt(report: Report): string {
  const fs = report.findings.filter((f) => f.severity !== "info" && f.confidence !== "judgment");
  const lines = [
    `You are fixing design issues on ${report.input.url || "this page"} (${report.input.pageType}). Squint measured the rendered page in headless Chromium and found the following. Each item has the evidence (what was measured) and a fix. Apply the fixes in the source; do not change copy unless asked; keep the visual intent. Make one commit per item.`,
    "",
  ];
  fs.forEach((f, i) => {
    lines.push(`${i + 1}. ${f.title}`);
    lines.push(`   Evidence: ${f.evidence}`);
    lines.push(`   Fix: ${f.fix}`);
    lines.push("");
  });
  if (report.judge?.genericCopy.length) {
    lines.push("Copy that could be on any site, with suggested rewrites:");
    for (const g of report.judge.genericCopy) lines.push(`- "${g.quote}" → "${g.rewrite}"`);
    lines.push("");
  }
  lines.push(`When done, re-run the report at ${typeof location !== "undefined" ? location.origin : ""}/ and compare the score (${report.score}/100 now).`);
  return lines.join("\n");
}

function ShareBox({ report }: { report: Report }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const origin = typeof location !== "undefined" ? location.origin : "";
  const link = `${origin}/r/${report.id}`;
  const badge = `[![Squint](${origin}/api/badge/${report.id})](${link})`;
  const prompt = useMemo(() => buildFixPrompt(report), [report]);
  async function copy(what: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); } catch {}
  }
  return (
    <div className="share">
      <button type="button" className="btn small" onClick={() => setShowPrompt((v) => !v)}>{showPrompt ? "Hide fix prompt" : "Get a fix prompt for Cursor / Claude Code"}</button>
      <button type="button" className="btn secondary small" onClick={() => copy("link", link)}>{copied === "link" ? "Copied" : "Copy report link"}</button>
      <button type="button" className="btn secondary small" onClick={() => copy("badge", badge)}>{copied === "badge" ? "Copied" : "Copy README badge"}</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/badge/${report.id}`} alt={`Squint ${report.score}`} height={20} />
      {showPrompt && (
        <div className="prompt">
          <textarea readOnly value={prompt} rows={14} />
          <button type="button" className="btn small" onClick={() => copy("prompt", prompt)}>{copied === "prompt" ? "Copied" : "Copy prompt"}</button>
          <p>Paste this into your coding agent in the repo. It lists every measured finding with its evidence; the agent applies the fixes, you re-run Squint.</p>
        </div>
      )}
    </div>
  );
}
