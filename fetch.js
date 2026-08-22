import { setTimeout as sleep } from 'node:timers/promises';

const DUFFEL_API_URL = 'https://api.duffel.com/air/offer_requests';
export const ORIGIN = 'MAD';
export const DESTINATION = 'DPS'; // Denpasar (Bali), Ngurah Rai Intl.

// The trip pattern: fly out Friday afternoon (a normal workday, so it costs
// no vacation time -- you just leave after work), work Mon-Fri the following
// week, fly home the Saturday evening after that. The MAD-DPS route runs
// long enough that a Saturday-evening departure from Bali lands in Madrid
// on the Sunday (a "+1" day) -- so the trip gets both full weekends at the
// destination (bar the Saturday evening spent flying home) while still only
// using 5 vacation days (Mon-Fri).
const SEARCH_YEAR = 2026;
const SEARCH_MONTH = 9; // September
const MAX_CONNECTIONS = 1; // exactly one stop each way, no direct, no 2-stop

// Local-time-of-day windows (24h, airport-local, matching Duffel's segment
// departing_at format) that qualify as a "Friday afternoon" MAD departure
// and a "Saturday evening" DPS departure.
const FRIDAY_DEPARTURE_MIN_HOUR = 14; // MAD departure must be at/after 14:00
const SATURDAY_RETURN_MIN_HOUR = 17; // DPS departure must be at/after 17:00

function saturdaysInMonth(year, month) {
  const dates = [];
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (d.getUTCMonth() === month - 1) {
    if (d.getUTCDay() === 6) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// One candidate per Saturday in the search month: depart the Friday
// afternoon before it, return the following Saturday evening (8 days
// later) -- both full weekends at the destination, 5 vacation days used.
function tripCandidates() {
  return saturdaysInMonth(SEARCH_YEAR, SEARCH_MONTH).map((anchorSaturday) => ({
    departureDate: addDays(anchorSaturday, -1),
    returnDate: addDays(anchorSaturday, 7),
  }));
}

async function requestOffers(departureDate, returnDate) {
  const body = {
    data: {
      slices: [
        { origin: ORIGIN, destination: DESTINATION, departure_date: departureDate, max_connections: MAX_CONNECTIONS },
        { origin: DESTINATION, destination: ORIGIN, departure_date: returnDate, max_connections: MAX_CONNECTIONS },
      ],
      passengers: [{ type: 'adult' }],
      cabin_class: 'economy',
    },
  };

  const res = await fetch(`${DUFFEL_API_URL}?return_offers=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DUFFEL_API_KEY}`,
      'Duffel-Version': 'v2',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Duffel request failed for ${departureDate} -> ${returnDate}: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json.data?.offers ?? [];
}

// Belt-and-braces on top of max_connections: only keep offers where both
// slices actually have exactly one stop (two segments).
function hasOneStopEachWay(offer) {
  return offer.slices.every((slice) => slice.segments.length === MAX_CONNECTIONS + 1);
}

function departureHour(offer, sliceIndex) {
  const firstSegment = offer.slices[sliceIndex].segments[0];
  return Number(firstSegment.departing_at.slice(11, 13));
}

function meetsTimeWindow(offer) {
  const outboundHour = departureHour(offer, 0);
  const returnHour = departureHour(offer, 1);
  return outboundHour >= FRIDAY_DEPARTURE_MIN_HOUR && returnHour >= SATURDAY_RETURN_MIN_HOUR;
}

function lowestFare(offers) {
  if (offers.length === 0) return null;
  return offers.reduce(
    (lowest, offer) => {
      const amount = parseFloat(offer.total_amount);
      return amount < lowest.amount
        ? { amount, currency: offer.total_currency, airline: offer.owner?.name ?? 'unknown' }
        : lowest;
    },
    { amount: Infinity, currency: null, airline: null },
  );
}

export async function fetchFares() {
  if (!process.env.DUFFEL_API_KEY) {
    throw new Error('DUFFEL_API_KEY is not set');
  }

  const fares = [];

  for (const { departureDate, returnDate } of tripCandidates()) {
    try {
      const offers = await requestOffers(departureDate, returnDate);
      const eligible = offers.filter((offer) => hasOneStopEachWay(offer) && meetsTimeWindow(offer));
      const cheapest = lowestFare(eligible);
      if (cheapest) {
        fares.push({ departureDate, returnDate, ...cheapest });
      } else if (offers.length > 0) {
        console.warn(`No eligible (1-stop, right time of day) offers for ${departureDate} -> ${returnDate}`);
      } else {
        console.warn(`No offers found for ${departureDate} -> ${returnDate}`);
      }
    } catch (err) {
      console.error(err.message);
    }
    await sleep(300); // be polite to the API between requests
  }

  return fares;
}
