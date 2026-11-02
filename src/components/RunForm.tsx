"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = ["Rendering in headless Chromium", "Measuring DOM geometry and computed styles", "Running Impeccable's detector", "Scoring first impression", "Asking the judge (if a key is set)"];

export function RunForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [mode, setMode] = useState<"url" | "html">("url");
  const [pageType, setPageType] = useState("landing");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [step, setStep] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    setStep(0);
    const tick = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4000);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "url" ? { url, pageType, goal } : { html, pageType, goal }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      router.push(`/r/${j.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    } finally {
      clearInterval(tick);
    }
  }

  return (
    <form className="run" onSubmit={submit}>
      {mode === "url" ? (
        <div className="field">
          <label htmlFor="url">URL</label>
          <input id="url" type="url" placeholder="https://your-site.vercel.app" value={url} onChange={(e) => setUrl(e.target.value)} required autoFocus />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="html">HTML</label>
          <textarea id="html" placeholder="<!doctype html> … paste a full page" value={html} onChange={(e) => setHtml(e.target.value)} required />
        </div>
      )}
      <button type="button" className="toggle" onClick={() => setMode(mode === "url" ? "html" : "url")}>
        {mode === "url" ? "Paste HTML instead" : "Use a URL instead"}
      </button>
      <div className="row2">
        <div className="field">
          <label htmlFor="type">What kind of page is this?</label>
          <select id="type" value={pageType} onChange={(e) => setPageType(e.target.value)}>
            <option value="landing">Product landing page</option>
            <option value="portfolio">Personal portfolio</option>
            <option value="hackathon">Hackathon project</option>
            <option value="ecommerce">E-commerce</option>
            <option value="docs">Docs / reference</option>
            <option value="other">Something else</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="goal">What should a stranger know after 10 seconds? (optional)</label>
          <input id="goal" placeholder="e.g. that I founded a club and can ship" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={500} />
        </div>
      </div>
      <button className="btn" type="submit" disabled={busy}>{busy ? "Working…" : "Run the report"}</button>
      {busy && <p className="status">{STEPS[step]} <span className="mono">· usually 10–40s</span></p>}
      {err && <p className="err">{err}</p>}
    </form>
  );
}
