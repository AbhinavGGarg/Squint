import Link from "next/link";
import { listReports } from "@/engine/store";
import { grade } from "@/engine/score";
import { RunForm } from "@/components/RunForm";

export const dynamic = "force-dynamic";

/* A real report, abridged: falconhacks2026.com scanned as a hackathon page. */
const EXAMPLE = {
  url: "falconhacks2026.com",
  type: "hackathon",
  score: 68,
  findings: [
    { sev: "error", title: "h2 headings render at 4 different sizes", ev: "“Your idea deserves a runway.” is 144px while “Before you ask.” is 60px. Sizes seen: 60, 72, 128, 144px." },
    { sev: "warn", title: "A lone badge “Free to attend” that does nothing", ev: "A 179×39px pill with a status dot that isn't clickable and isn't one of a set. Badges imply a category system; one is decoration." },
    { sev: "warn", title: "Rounded icon tile above 3 headings", ev: "Three 56px tinted squares sit directly above feature titles: the default generated feature grid." },
    { sev: "warn", title: "Links to this page unfurl as a blank card", ev: "No og:image. Every share on iMessage, Discord and X renders from that tag." },
  ],
};

const CATALOGUE: { fam: string; n: string; rules: string }[] = [
  { fam: "What an engineer notices", n: "8 rules · measured", rules: "Same-level headings at different sizes (heading-size-drift) · a card whose content fills under 40% of it (container-vs-content) · a row of tiles stretched to the tallest one (stretched-row-cards) · siblings off by 2–3px (misaligned-siblings) · uneven gaps in repeated items · a type scale with no step over 1.25× · more than four corner radii · text under 6px from its box edge." },
  { fam: "What makes it look generated", n: "30 rules · measured and heuristic", rules: "Violet accent and purple-to-blue gradients · gradient-filled text · neon glow shadows · emoji as icons · icon tiles above headings · three identical cards · eyebrow chip over a giant h1 · cards inside cards · a lone badge that does nothing · pulsing status dots · cream + serif + sage · untouched shadcn · accent stripes · glassmorphism · permanent dark · numbered steps · stat banners · sparkle badges · logo bars · fake macOS window dots · gradient letter avatars · centered hero · tracked caps labels · aurora blobs." },
  { fam: "Copy", n: "8 rules · measured", rules: "Marketing buzzwords (the unlock / supercharge / seamless family) · the not-just-X-but-Y construction · em-dash density · placeholder names and filler text · a headline that could be on any site · formulaic openers and closers · the whether-you're-a-this-or-a-that opener · social proof with no source (round user counts, star ratings nobody can check)." },
  { fam: "On a phone", n: "3 rules · 390px render", rules: "Page scrolls sideways · text under 12px · tap targets under 32px." },
  { fam: "How the link unfurls", n: "3 rules · HTML", rules: "og:image, og:title and meta description · canonical, viewport, lang, favicon, JSON-LD · exactly one h1." },
  { fam: "First impression", n: "3 metrics · screenshot", rules: "Visual complexity by quadtree with text masked, colourfulness (Hasler & Süsstrunk), whitespace share. After Reinecke et al. 2013, who found complexity and colourfulness explain about half the variance in 500 ms appeal ratings." },
];

export default async function Home() {
  const recent = await listReports(10);
  return (
    <main>
      <section className="hero">
        <div>
          <h1>Find out why your site looks generated. With numbers.</h1>
          <p className="lede">
            Squint renders your page in a real browser and measures what a front-end engineer notices in ten seconds: headings that drift, cards that are mostly air, badges that say nothing, the defaults every AI builder ships. Then it tells you what to change.
          </p>
          <RunForm />
        </div>
        <aside className="example" aria-label="Example report">
          <div className="k"><span>Example report · {EXAMPLE.type} page</span><span>{EXAMPLE.findings.length} of 15 findings</span></div>
          <div className="site">{EXAMPLE.url}</div>
          <div className="scoreline">
            <div className="n">{EXAMPLE.score}<small>/100</small></div>
            <div className="g"><b>{grade(EXAMPLE.score).letter}</b>{grade(EXAMPLE.score).word}</div>
          </div>
          <ol>
            {EXAMPLE.findings.map((f) => (
              <li key={f.title}>
                <span className={`sev ${f.sev}`}>{f.sev === "error" ? "ERROR" : "WARN"}</span>
                <span><b>{f.title}</b><span>{f.ev}</span></span>
              </li>
            ))}
          </ol>
          <p className="more">Every finding comes with the measurement, a fix, and a crop of the screenshot with the element boxed.</p>
        </aside>
      </section>

      <section className="section">
        <h2>Three kinds of finding, labelled by how much to trust them</h2>
        <p className="sub">Vision models score about 58% on simple spatial questions. A headless browser reading the DOM scores 100%. So Squint measures first and only asks a model about the things a ruler can&apos;t settle.</p>
        <div className="cols">
          <div>
            <h3>Measured</h3>
            <p>Read straight from the rendered page: “h2 at 144px here and 60px there”, “content fills 29% of this card”, “this pill is 179×39px and not clickable”. These are facts. You can go and check them.</p>
          </div>
          <div>
            <h3>Heuristic</h3>
            <p>A rule with a threshold that is usually right and occasionally misfires: three equal cards, a lone badge, cream plus serif plus sage. Every one of these has a Yes/No control, and your answer feeds the next version.</p>
          </div>
          <div>
            <h3>Judgment</h3>
            <p>Coming as the paid tier: a reviewer that never saw your code looks at the first screen alone and answers what this is, who it&apos;s for and why anyone should care, then rewrites the copy that could be on any site.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>The catalogue</h2>
        <p className="sub">Fifty-five rules and three metrics. Thresholds borrowed from Impeccable and UXly, tell rankings from a corpus of 3,000 Reddit comments and a study of 500 Show HN launches, and every rule names its source in the report.</p>
        <div className="catalogue">
          {CATALOGUE.map((c) => (
            <div key={c.fam} style={{ display: "contents" }}>
              <div className="fam">{c.fam}<small>{c.n}</small></div>
              <div className="rules">{c.rules}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="cli">
        <h2>From the terminal, or in CI</h2>
        <p className="sub">No install, no browser download. The hosted engine renders; you get the findings and an exit code.</p>
        <pre className="term"><span className="c"># one URL, exit 2 if it scores under 70</span>{"\n"}npx squint-test https://your-site.com <span className="o">--type</span> portfolio <span className="o">--fail-under</span> 70{"\n\n"}<span className="c"># GitHub Action, on every preview deploy</span>{"\n"}- uses: AbhinavGGarg/Squint@main{"\n"}  with: {"{"} url: $&#123;&#123; steps.deploy.outputs.url &#125;&#125;, fail-under: 70 {"}"}</pre>
      </section>

      <section className="section why">
        <h2>Why this isn&apos;t a prompt</h2>
        <p><b>The judge is never the author.</b> Most of these pages were built by a model. Models rate their own output higher than people do, because it reads as familiar to them. Squint&apos;s rules involve no model at all, and when the judge runs it is a different model that is handed the measurements and told not to re-derive them.</p>
        <p><b>Generic, not “AI”.</b> Squint does not claim to know who wrote your page. It measures whether the page looks like anybody made a decision: whether the type scale was chosen, whether the badge means something, whether the copy would still work on a competitor&apos;s site with the logo covered.</p>
        <p><b>The score is a starting point, not a verdict.</b> It is calibrated on a handful of sites so far. Every scan and every Yes/No click makes it better, which is the whole reason it is free.</p>
      </section>

      {recent.length > 0 && (
        <section className="recent">
          <h2>Recent reports</h2>
          {recent.map((r) => (
            <Link key={r.id} href={`/r/${r.id}`}>
              <span className="n">{r.score}</span>
              <span>
                <cite style={{ fontStyle: "normal" }}>{r.page.title || r.input.url || "Pasted HTML"}</cite>
                <span className="t"> · {grade(r.score).word} · {r.input.pageType}</span>
              </span>
              <span className="t">{new Date(r.createdAt).toLocaleDateString()}</span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
