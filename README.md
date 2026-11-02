# Squint — the squint test, automated

Designers check hierarchy by squinting at a page: whatever still stands out is what it actually says. Squint does that to a URL, with numbers.

Paste a URL. Squint renders it in headless Chromium, **measures** what a front-end engineer notices in ten seconds, **fingerprints** the defaults every AI site builder ships, scores the **first impression** the way the research says people form it, and (with an LLM key) runs a **ten-second test** with advice tailored to what the page is for.

It is not an "AI detector". It answers a more useful and more defensible question: *does this page look like anybody made a decision?*

## Run it

```bash
npm install
npx playwright install chromium     # once; the renderer needs a browser
cp .env.example .env.local          # optional: add an LLM key for the judge
npm run dev                         # http://localhost:3000
```

CLI (same engine, JSON or text, exit code for CI):

```bash
npm run squint -- https://your-site.vercel.app --type landing
npm run squint -- fixtures/saas-slop.html --type landing --json
npm run squint -- https://your-site.vercel.app --fail-under 70   # exit 2 if below
```

Regression check on the bundled fixtures (the four findings from the portfolio that started this, a classic AI-SaaS page, and a clean control):

```bash
npm run verify
```

## What it measures

**Consistency — measured from DOM geometry and computed styles, so these are facts, not opinions.**
`heading-size-drift` (same heading level, different sizes), `container-vs-content` (a card whose content fills <40% of it), `stretched-row-cards` (a row of equal-height tiles where one wrapped line dictates everyone's height), `misaligned-siblings` (2–3px offsets), `uneven-gaps`, `flat-type-hierarchy`, `radius-sprawl`, `cramped-padding`.

**Generic — the fingerprints of unedited generated UI, ranked by how often real people call them out.**
`ai-purple`, `gradient-text`, `neon-glow`, `emoji-as-icons`, `icon-tile-stack`, `three-equal-cards`, `hero-eyebrow-chip`, `cards-in-cards`, `decorative-badge` (a lone pill that does nothing), `inert-tags`, `pulsing-dot`, `status-dots`, `tasteful-default` (cream + serif + sage, the 2026 tell), `shadcn-untouched`, `overused-font`, `animation-overload`.

**Copy.** `marketing-buzzwords`, `contrastive-reframe` ("it's not just X, it's Y"), `em-dash-density`, `placeholder-content` (lorem ipsum, "Sarah J., Product Manager"), `generic-headline`.

**First impression — from the viewport screenshot, after Reinecke et al. 2013.** Colorfulness (Hasler & Süsstrunk), quadtree visual complexity with text masked, whitespace share, text density. Reinecke found complexity + colorfulness explain ~48% of the variance in 500 ms appeal ratings, with high complexity the strongest negative.

**Impeccable** (Apache-2.0, 62 deterministic rules) runs as a second engine; duplicates are merged. On a URL it uses your installed Chrome for rendered-page rules (contrast, tiny text, overflow); otherwise it runs its pattern rules on the captured HTML.

**Judge (needs a key).** Looks at the first screen *alone* and answers what is this / who is it for / why care; finds copy that could be on any site and rewrites it with facts from the page; gives advice conditioned on the page type (portfolio, landing, hackathon, e-commerce, docs) and your stated goal. Critiques use Google's UICrit format: *expected standard / current design / fix*. The judge is told the measured facts and asked not to re-derive them, and it is never the model that built the page.

Every finding carries a **confidence**: `measured` (a fact), `heuristic` (a rule that can misfire), `judgment` (a reviewer's opinion). The score weights them accordingly.

## Configuration

`.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-…        # or
OPENAI_API_KEY=sk-…
SQUINT_LLM_PROVIDER=anthropic   # anthropic | openai | mock | none (default: auto from keys)
SQUINT_LLM_MODEL=…              # optional override
SQUINT_DATA_DIR=.squint      # where reports and screenshots are stored
```

`SQUINT_LLM_PROVIDER=mock` returns a canned judge answer so you can develop the UI without spending tokens.

## Layout

```
src/engine/           the engine, no Next.js dependency
  render.ts           Playwright: screenshot + DOM/computed-style snapshot
  snapshot.browser.ts the in-page script (compiled to a string by scripts/build-snapshot.mjs)
  rules/              consistency.ts, container.ts, fingerprints.ts, copy.ts
  metrics/appeal.ts   colorfulness, quadtree complexity, whitespace
  impeccable.ts       adapter for the Impeccable CLI
  judge/              provider-agnostic LLM judge (fetch only, no SDKs)
  score.ts            decaying-weight scoring, grades
  analyze.ts          orchestrator
src/app/              Next.js app: / (run), /r/[id] (report), /api/*
scripts/cli.ts        terminal runner · scripts/verify.ts fixture regression
fixtures/             portfolio.html, saas-slop.html, clean.html
```

## Where the thresholds come from

See `NOTICES.md` for licenses. Rules adapted from UXly (MIT) and Impeccable (Apache-2.0); tell ranking from vibecoded-design-tells (MIT, 3,033 Reddit comments); copy patterns from Impeccable and halans/ai-pattern-detection (MIT); critique format and few-shots from UICrit (Duan et al., UIST '24, CC-BY-4.0); first-impression metrics after Lindgaard 2006, Tuch/Reinecke 2012 and Reinecke 2013; whitespace after Lin 2004; ten-second framing after NN/g and the Ladders 2018 eye-tracking study.

## Roadmap (what would make this a company rather than a tool)

1. A corpus: a few hundred vibe-coded sites and a few hundred human-designed ones, so scores are calibrated against reality rather than three fixtures.
2. Expert corrections: every reviewer who says "this finding is wrong / this one's missing" is a row in the dataset nobody else has. The portfolio findings that started this project were four such rows.
3. The fix: a generated PR that applies the measured fixes (align-items, one heading size, delete the badge) and proposes copy rewrites.
4. Badge + CI: a shareable score and a GitHub Action with `--fail-under`.
