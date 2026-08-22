# misurf

A daily agent that checks MAD → DPS (Bali) round-trip fares via Duffel, for
the "5 vacation days, 2 free weekends" trip pattern in September: depart on
a Saturday, return the Sunday 8 nights later, exactly one stop each way. It
compares fares against a running price history, has Claude pick the 3-5 best
deals, and emails the shortlist via Resend. Runs on a schedule via GitHub
Actions — nothing books anything, it's read-only search and notify.

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

Every candidate is a 9-day trip: fly out Saturday, take the following Mon-Fri
off (5 vacation days), fly back the Sunday after that — both surrounding
weekends are "free" days off. `fetch.js` generates one candidate per Saturday
in September 2026 (Sep 5, 12, 19, 26) and searches Duffel for the cheapest
one-stop-each-way fare for that exact departure/return pair.

To change the month/year or the number of vacation days, edit the constants
at the top of `fetch.js` (`SEARCH_YEAR`, `SEARCH_MONTH`, `TRIP_NIGHTS`).

## Files

- `fetch.js` — builds the Saturday-departure trip candidates and queries Duffel for MAD → DPS fares, one stop each way
- `history.js` / `history.json` — tracks the lowest fare seen per departure date
- `analyze.js` — asks Claude to pick the best deals from today's fares
- `email.js` — sends the shortlist via Resend
- `index.js` — runs the pipeline end to end
- `.github/workflows/daily.yml` — the daily cron (plus manual trigger)
