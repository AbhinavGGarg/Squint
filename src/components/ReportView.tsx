"use client";
import { useMemo, useState } from "react";
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
        <Sub k="Clarity" v={report.subScores.clarity} d={report.judge ? "ten-second test" : "needs an LLM key"} />
        <Sub k="First impression" v={report.subScores.appeal} d={report.metrics ? `${report.metrics.complexityLeaves} leaves · M ${report.metrics.colorfulness}` : "—"} />
      </div>

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
            <div className="note">
              {report.judgeSkipped || "Judge did not run."} Add <code>ANTHROPIC_API_KEY=…</code> or <code>OPENAI_API_KEY=…</code> to <code>.env.local</code> and re-run to get the ten-second test, generic-copy rewrites and advice tailored to the page&apos;s goal.
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
                  <FindingRow key={f.id} f={f} onHover={setHover} />
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
            <img src={`/api/report/${report.id}/screenshot?which=full`} alt="Full-page screenshot" width={imgW} height={imgH} />
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

function FindingRow({ f, onHover }: { f: Finding; onHover: (id: string | null) => void }) {
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
      </div>
    </div>
  );
}
