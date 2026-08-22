# misurf

A daily agent that checks MAD → DPS (Bali) round-trip fares via Duffel, for
the "5 vacation days, 2 free weekends" trip pattern in September: fly out
Friday night or Saturday morning, fly home the following Saturday evening on
a redeye that lands back in Madrid Sunday morning — exactly one stop each
way. It compares fares against a running price history, has Claude pick the
3-5 best deals, and emails the shortlist via Resend. Runs on a schedule via
GitHub Actions — nothing books anything, it's read-only search and notify.

See [SETUP.md](SETUP.md) for the full setup guide.

## Local development

```
npm install
export DUFFEL_API_KEY=your_test_key
export ANTHROPIC_API_KEY=your_key
export RESEND_API_KEY=your_key
export TO_EMAIL=you@example.com
node index.js
```

## The trip pattern

Every candidate uses only 5 vacation days (Mon-Fri) plus both full weekends
at the destination:

- **Out** — fly MAD → DPS Friday afternoon or later (a normal workday, so no
  vacation time is spent getting there)
- **Back** — fly DPS → MAD the following Saturday evening. The route is long
  enough that this lands in Madrid on the **Sunday** (a "+1" day), so Sunday
  is spent recovering at home instead of in transit, and Monday is a normal
  workday.

`fetch.js` generates one candidate per Saturday in September 2026 (Sep 5, 12,
19, 26 — paired with the Friday before and the Saturday a week after) and
searches Duffel for the cheapest one-stop fare that also matches the right
time of day (MAD departure at/after 14:00, DPS departure at/after 17:00).

To change the month/year or the time windows, edit the constants at the top
of `fetch.js` (`SEARCH_YEAR`, `SEARCH_MONTH`, `FRIDAY_DEPARTURE_MIN_HOUR`,
`SATURDAY_RETURN_MIN_HOUR`).

## Files

- `fetch.js` — builds the Saturday-departure trip candidates and queries Duffel for MAD → DPS fares, one stop each way
- `history.js` / `history.json` — tracks the lowest fare seen per departure date
- `analyze.js` — asks Claude to pick the best deals from today's fares
- `email.js` — sends the shortlist via Resend
- `index.js` — runs the pipeline end to end
- `.github/workflows/daily.yml` — the daily cron (plus manual trigger)
