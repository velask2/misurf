# misurf

A daily agent that checks MAD → DPS (Bali) round-trip fares via Duffel, for
a September trip: fly out Friday evening or Saturday, fly home the following
Saturday — whichever combination is cheapest — with exactly one stop each
way and a layover no longer than 3 hours. It compares fares against a
running price history, has Claude pick the 3-5 best deals, and emails the
shortlist via Resend. Runs on a schedule via GitHub Actions — nothing books
anything, it's read-only search and notify.

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

Every candidate uses only 5 vacation days (Mon-Fri). Two outbound flavors
per week, both returning the following Saturday:

- **Friday evening** — fly MAD → DPS Friday evening (at/after 18:00)
- **Saturday** — fly MAD → DPS Saturday, any time

Whichever is cheaper wins — this is a price search, not a schedule
preference. Every itinerary is also restricted to exactly one stop each way,
with a layover no longer than 3 hours.

`fetch.js` generates both outbound options for every Saturday in September
2026 (Sep 5, 12, 19, 26, each paired with the Friday before and the
following Saturday) and searches Duffel for the cheapest eligible fare per
option.

To change the month/year, the layover limit, or the Friday time window,
edit the constants at the top of `fetch.js` (`SEARCH_YEAR`, `SEARCH_MONTH`,
`MAX_CONNECTION_MINUTES`, `FRIDAY_EVENING_MIN_HOUR`).

## Files

- `fetch.js` — builds the trip candidates and queries Duffel for MAD → DPS fares, one stop each way, ≤3h layover
- `history.js` / `history.json` — tracks the lowest fare seen per departure date
- `analyze.js` — asks Claude to pick the best deals from today's fares
- `email.js` — sends the shortlist via Resend
- `index.js` — runs the pipeline end to end
- `.github/workflows/daily.yml` — the daily cron (plus manual trigger)
