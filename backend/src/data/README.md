# Curated reliability dataset

Hand-maintained subset of Wikipedia's [Perennial Sources](https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources/Perennial_sources)
verdicts, normalized to a 4-tier scale.

## Tiers

- **high** — "Generally reliable" per editor consensus. Multiple independent
  fact-checks and a track record of corrections.
- **medium** — "No consensus" or some reliability concerns noted.
- **mixed** — Reliable for some topics, unreliable for others; deprecated in
  some contexts.
- **low** — "Generally unreliable" or "deprecated" per editor consensus.

## Maintenance

Editing rule: when adding a publisher, **read the linked Wikipedia section**
and pick the tier from the editor consensus. Do not invent tiers from your
own judgment. Commit the full wiki URL in the commit message so reviewers
can verify.

Refresh cadence: review every 6 months. Wikipedia consensus drifts.

## Why hand-curated and not scraped

Wikipedia's Perennial Sources page is freeform prose, not a structured feed.
Auto-scraping breaks regularly when editors restructure sections. ~30
high-traffic publishers cover the vast majority of articles users paste,
and a slow expansion path stays safer.
