# Third-party notices

Squint builds on the following. Code was read and re-implemented in TypeScript where the license permits; thresholds, phrase lists and the critique format are credited here.

| Project | License | Used for |
|---|---|---|
| [Impeccable](https://github.com/pbakaus/impeccable) by Paul Bakaus | Apache-2.0 | Runs as a second engine via its CLI (`impeccable` npm package). Thresholds for purple/gradient/glow/icon-tile/eyebrow/flat-hierarchy rules and the marketing buzzword list are adapted from its Rust sources. |
| [UXly](https://github.com/asynkron/UXly) | MIT | Algorithms for misaligned siblings, uneven gaps, nested panels, cramped padding, radius sprawl, and the decaying-weight score. |
| [vibecoded-design-tells](https://github.com/JCarterJohnson/vibecoded-design-tells) | MIT (code) | Ranked catalogue of tells and their evidence from a Reddit corpus; cream-palette hexes; tell numbering in finding text. |
| [UICrit](https://github.com/google-research-datasets/uicrit), Duan et al., UIST '24 | CC-BY-4.0 | Critique format ("The expected standard is … In the current design, … To fix this, …") and the few-shot examples in `src/engine/judge/judge.ts`. |
| [slop-detect](https://github.com/ravidsrk/slop-detect) | MIT | Rule ideas and prevalence weights for the second fingerprint batch (accent stripe, glassmorphism, perma-dark, numbered steps, stat banner, sparkle badges, logo bar, window chrome, gradient avatars, aurora), copy patterns (filler openers/closers, whether-you're, fake social proof), AEO-style head checks. Re-implemented; nothing copied. |
| Adrian Krebs, "Design slop" (500 Show HN launches, 2026) | blog post, cited | Prevalence figures quoted in finding text. |
| [ai-pattern-detection](https://github.com/halans/ai-pattern-detection) | MIT | Contrastive-reframe pattern and placeholder patterns. |
| [Slopdar](https://github.com/Slopdar/slopdar) | MIT (code only; name and data excluded) | Em-dash density threshold, emoji-as-icon signal. |
| [no-slop](https://github.com/blahajcoding/no-slop) | MIT | Status-pill-with-dot and icon-in-box heuristics. |
| vizweb (Reinecke et al.) | no license — read for reference only, nothing copied | Confirmed the colorfulness formula and quadtree approach; implementation here is original on `sharp`. |

Research cited in findings: Lindgaard et al. 2006 (50 ms impressions); Tuch, Reinecke et al. 2012 (visual complexity and prototypicality); Reinecke et al. CHI 2013 (predicting appeal from colorfulness and complexity); Hasler & Süsstrunk 2003 (colorfulness); Lin 2004 (whitespace and comprehension); Nielsen Norman Group (first ten seconds); Ladders 2018 eye-tracking study; Duan et al. UIST '24 (UICrit); Rahmanzadehgervi et al. 2024 ("Vision language models are blind"); Panickssery et al. 2024 (self-preference bias in LLM-as-a-judge).

Playwright (Apache-2.0), sharp (Apache-2.0), Next.js (MIT).
