# MAD → DPS (Bali) September flight deal agent — setup guide

Repo: **misurf** (on GitHub)

See `architecture.svg` for the pipeline diagram. Sibling project to `honey`
(same pipeline shape, different route and trip pattern) — see that repo if
you want to compare.

## Progress so far

- [x] **Step 1** — Repo scaffolded and pushed to GitHub
- [ ] **Step 2** — Add secrets to the `misurf` repo (same keys as `honey`, can reuse the same values): `DUFFEL_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `TO_EMAIL` ← **you are here**
- [ ] **Step 3** — Test locally
- [ ] **Step 4** — Test the GitHub Action manually
- [ ] **Step 5** — Go live (swap in the live Duffel key)

## The goal, restated

A script that runs **automatically, once a day, with no laptop involved**:
1. Builds one trip candidate per Saturday in September (depart that Saturday, return the Sunday 8 nights later — 5 vacation days, 2 free weekends) and asks Duffel for the cheapest MAD→DPS fare with exactly one stop each way
2. Compares today's prices to a running history file, so it knows what's actually a *good* price vs just a normal one
3. Has Claude pick the best 3–5 deals and explain why in plain language
4. Emails you that shortlist via Resend

Nothing here books anything — it's read-only, search and notify.

## Step 2 — Add secrets

```
gh secret set DUFFEL_API_KEY --repo velask2/misurf
gh secret set ANTHROPIC_API_KEY --repo velask2/misurf
gh secret set RESEND_API_KEY --repo velask2/misurf
gh secret set TO_EMAIL --repo velask2/misurf
```

You can paste the same values you used for `honey` — same accounts, just a
different route. Start with the Duffel **test** key.

## Step 3 — Test locally first

```
npm install
export DUFFEL_API_KEY=your_test_key
export ANTHROPIC_API_KEY=your_key
export RESEND_API_KEY=your_key
export TO_EMAIL=you@example.com
node index.js
```

Check your inbox. Iterate with Claude Code until the email looks right.

## Step 4 — Test the GitHub Action manually

Go to the **Actions** tab in GitHub, select the workflow, and click **Run
workflow** (this is what `workflow_dispatch` enables). Confirm it runs clean
and the email arrives.

## Step 5 — Go live

1. Swap `DUFFEL_API_KEY` in GitHub secrets for your **live** Duffel key
2. Let the daily cron take over — no need to touch your Mac again
3. Check in on `history.json` occasionally to see your price trend build up
4. When September 2026 passes, bump `SEARCH_YEAR`/`SEARCH_MONTH` in `fetch.js` for next year's trip

## Troubleshooting notes

- If Duffel test mode data looks unrealistic (fake prices/schedules), that's expected — sandbox data isn't live. Switch to the live key to see real fares.
- MAD-DPS realistically has no nonstop option, so `max_connections: 1` should still return plenty of offers — if a date comes back empty, it usually means no one-stop itinerary was available that day, not a bug.
- If the Action's commit-back step fails, make sure the workflow has `permissions: contents: write` set.
- If emails aren't arriving, check Resend's dashboard logs before assuming the script is broken — it usually flags spam-filtering or unverified sender issues clearly.
