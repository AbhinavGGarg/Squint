import Link from "next/link";
import { listReports } from "@/engine/store";
import { grade } from "@/engine/score";
import { RunForm } from "@/components/RunForm";

export const dynamic = "force-dynamic";

export default async function Home() {
  const recent = await listReports(12);
  return (
    <main>
      <section className="hero">
        <h1>Find out why your site looks generated, with numbers.</h1>
        <p>
          Paste a URL. Squint renders it, measures the things a front-end engineer notices in ten seconds (alignment, type scale, cards that are mostly air, badges that say nothing), fingerprints the defaults every AI builder ships, and scores the first impression the way the research says people form it.
        </p>
      </section>
      <RunForm />
      <section className="how">
        <div>
          <h2>Measured, not guessed</h2>
          <p>Every consistency finding comes from DOM geometry and computed styles: “h2 at 56px here, 44px there”, “content fills 29% of this card”. Vision models score 58% on simple spatial tasks; a headless browser scores 100%.</p>
        </div>
        <div>
          <h2>Generic, not “AI”</h2>
          <p>Purple gradients, glow, emoji icons, three equal cards, cream + serif + sage, “unlock the power of”. Ranked by how often real people call them out, with thresholds borrowed from Impeccable&apos;s 62-rule detector.</p>
        </div>
        <div>
          <h2>Ten-second test <span className="soon">Pro, coming soon</span></h2>
          <p>A reviewer that never saw your code looks at the first screen alone and answers: what is this, who is it for, why should I care, and what to change for this page&apos;s goal. Critiques follow Google&apos;s UICrit format: expected standard, current design, fix.</p>
        </div>
      </section>
      {recent.length > 0 && (
        <section className="recent">
          <h2>Recent reports</h2>
          {recent.map((r) => (
            <Link key={r.id} href={`/r/${r.id}`}>
              <span className="n">{r.score}</span>
              <span>
                {r.page.title || r.input.url || "Pasted HTML"}
                <span className="t"> · {grade(r.score).word} · {r.input.pageType}</span>
              </span>
              <span className="t">{new Date(r.createdAt).toLocaleString()}</span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
