# squint-test

Run the squint test on a URL from the terminal or CI.

```bash
npx squint-test https://your-site.com
npx squint-test https://your-site.com --type portfolio --fail-under 70
npx squint-test https://your-site.com --json > report.json
```

Measured design lint (alignment, type scale, cards that are mostly air), fingerprints of unedited AI output (purple gradients, glow, three equal cards, eyebrow pills…), copy tells, a mobile pass, head/link-preview hygiene, and first-impression metrics after Reinecke et al. 2013.

Zero dependencies. The hosted Squint does the rendering; point `--host` or `SQUINT_HOST` at your own instance if you self-host.

Exit codes: `0` ok · `2` score below `--fail-under` · `1` error. Rate limit on the public host: 5 scans a minute per IP; the same URL is cached for 24h (`--fresh` to force).

Web version: https://squint-rosy.vercel.app · Source: https://github.com/AbhinavGGarg/Squint
